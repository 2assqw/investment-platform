import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide, thresholdScore, inverseThresholdScore } from './scoring';

const ROE_THRESHOLDS = [25, 30, 20, 15, 10, 5];
const ROIC_THRESHOLDS = [25, 20, 15, 10, 5, 2];
const FCF_MARGIN_THRESHOLDS = [25, 25, 20, 15, 10, 5];
const DEBT_THRESHOLDS = [25, 20, 40, 60, 80, 100];

export const qualityEngine: Engine = {
  name: 'quality',

  calculate(input: EngineInput): EngineOutput {
    // Sort by fiscal year ascending so last element = latest year.
    // getFinancials() returns DESCENDING, so we re-sort here.
    const sorted = [...input.financials].sort((a, b) => a.fiscal_year - b.fiscal_year);
    const latest = sorted[sorted.length - 1];

    if (!latest) {
      return { score: 0, breakdown: {} };
    }

    const roeRaw = safeDivide(latest.net_income, latest.shareholder_equity);
    const roicRaw = safeDivide(latest.operating_income, latest.total_assets);
    const fcfRaw = safeDivide(latest.free_cash_flow, latest.revenue);
    const debtRaw = safeDivide(latest.total_liabilities, latest.total_assets);

    const roe = roundToDecimal(roeRaw * 100, 1);
    const roic = roundToDecimal(roicRaw * 100, 1);
    const fcfMargin = roundToDecimal(fcfRaw * 100, 1);
    const debtRatio = debtRaw;

    const roeScore = thresholdScore(roe, ROE_THRESHOLDS);
    const roicScore = thresholdScore(roic, ROIC_THRESHOLDS);
    const fcfScore = thresholdScore(fcfMargin, FCF_MARGIN_THRESHOLDS);
    const debtScore = inverseThresholdScore(debtRatio * 100, DEBT_THRESHOLDS);

    const totalScore = clamp(roeScore + roicScore + fcfScore + debtScore, 0, 100);

    // ROIC debug trace
    const roicGuard = diagnoseRoic(latest);

    return {
      score: totalScore,
      breakdown: {
        roe: { value: roe, score: roeScore },
        roic: { value: roic, score: roicScore, debug: roicGuard },
        fcfMargin: { value: fcfMargin, score: fcfScore },
        debtRatio: { value: roundToDecimal(debtRatio * 100, 1), score: debtScore },
        _fiscalYearUsed: latest.fiscal_year,
      },
    };
  },
};

function diagnoseRoic(f: {
  fiscal_year: number;
  operating_income: number;
  total_assets: number;
  total_liabilities: number;
}): Record<string, unknown> {
  const oi = f.operating_income;
  const ta = f.total_assets;

  const debug: Record<string, unknown> = {
    fiscalYear: f.fiscal_year,
    operatingIncome: oi,
    totalAssets: ta,
    investedCapital: ta,
  };

  if (oi === 0) {
    debug.guardTriggered = 'operating_income_zero';
    debug.formulaResult = 0;
  } else if (!Number.isFinite(ta) || ta <= 0) {
    debug.guardTriggered = 'total_assets_non_positive';
    debug.formulaResult = 0;
  } else {
    debug.formulaResult = roundToDecimal((oi / ta) * 100, 1);
  }

  return debug;
}
