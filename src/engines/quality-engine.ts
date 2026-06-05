import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide, thresholdScore, inverseThresholdScore } from './scoring';

const ROE_THRESHOLDS = [25, 30, 20, 15, 10, 5];
const ROIC_THRESHOLDS = [25, 20, 15, 10, 5, 2];
const FCF_MARGIN_THRESHOLDS = [25, 25, 20, 15, 10, 5];
const DEBT_THRESHOLDS = [25, 20, 40, 60, 80, 100];

export const qualityEngine: Engine = {
  name: 'quality',

  calculate(input: EngineInput): EngineOutput {
    const latest = input.financials[input.financials.length - 1];
    if (!latest) {
      return { score: 0, breakdown: {} };
    }

    const roe = roundToDecimal(safeDivide(latest.net_income, latest.shareholder_equity) * 100, 1);
    const roic = roundToDecimal(safeDivide(latest.operating_income, latest.total_assets) * 100, 1);
    const fcfMargin = roundToDecimal(safeDivide(latest.free_cash_flow, latest.revenue) * 100, 1);
    const debtRatio = safeDivide(latest.total_liabilities, latest.total_assets);

    const roeScore = thresholdScore(roe, ROE_THRESHOLDS);
    const roicScore = thresholdScore(roic, ROIC_THRESHOLDS);
    const fcfScore = thresholdScore(fcfMargin, FCF_MARGIN_THRESHOLDS);
    const debtScore = inverseThresholdScore(debtRatio * 100, DEBT_THRESHOLDS);

    const totalScore = clamp(roeScore + roicScore + fcfScore + debtScore, 0, 100);

    return {
      score: totalScore,
      breakdown: {
        roe: { value: roe, score: roeScore },
        roic: { value: roic, score: roicScore },
        fcfMargin: { value: fcfMargin, score: fcfScore },
        debtRatio: { value: roundToDecimal(debtRatio * 100, 1), score: debtScore },
      },
    };
  },
};
