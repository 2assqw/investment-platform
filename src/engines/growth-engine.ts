import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide, cagr, thresholdScore } from './scoring';

const CAGR_THRESHOLDS = [33, 30, 20, 15, 10, 5, 0];

export const growthEngine: Engine = {
  name: 'growth',

  calculate(input: EngineInput): EngineOutput {
    const sorted = [...input.financials].sort((a, b) => b.fiscal_year - a.fiscal_year);
    if (sorted.length < 4) {
      return { score: 0, breakdown: { error: 'insufficient data, need 4+ years for 3Y CAGR' } };
    }

    const latest = sorted[0]!;
    const threeYearsAgo = sorted[3]!;

    const revenueCagr = cagr(threeYearsAgo.revenue, latest.revenue, 3);
    const epsLatest = safeDivide(latest.net_income, latest.shares_outstanding);
    const epsPrior = safeDivide(threeYearsAgo.net_income, threeYearsAgo.shares_outstanding);
    const epsCagr = cagr(epsPrior, epsLatest, 3);
    const fcfCagr = cagr(threeYearsAgo.free_cash_flow, latest.free_cash_flow, 3);

    const revenueScore = thresholdScore(revenueCagr * 100, CAGR_THRESHOLDS);
    const epsScore = thresholdScore(epsCagr * 100, CAGR_THRESHOLDS);
    const fcfScore = thresholdScore(fcfCagr * 100, CAGR_THRESHOLDS);

    const totalScore = clamp(revenueScore + epsScore + fcfScore, 0, 100);

    return {
      score: totalScore,
      breakdown: {
        revenueCagr: { value: roundToDecimal(revenueCagr * 100, 1), score: revenueScore },
        epsCagr: { value: roundToDecimal(epsCagr * 100, 1), score: epsScore },
        fcfCagr: { value: roundToDecimal(fcfCagr * 100, 1), score: fcfScore },
      },
    };
  },
};
