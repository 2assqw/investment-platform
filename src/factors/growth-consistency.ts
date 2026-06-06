import { Factor, FactorInput, FactorResult } from './factor-types';
import { safeDivide, clamp, roundToDecimal } from '../engines/scoring';

/**
 * Factor 001: Growth Consistency
 * Rewards stable year-over-year growth. Penalizes volatile boom-bust patterns.
 * Uses revenue as the primary metric.
 */
export const growthConsistencyFactor: Factor = {
  name: 'growth_consistency',

  calculate(input: FactorInput): FactorResult {
    const sorted = [...input.financials].sort((a, b) => a.fiscal_year - a.fiscal_year);
    if (sorted.length < 4) {
      return { factor: 'growth_consistency', score: 0, metrics: {}, breakdown: { error: 'need 4+ years' } };
    }

    // Calculate YoY revenue growth rates
    const growthRates: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!.revenue;
      const curr = sorted[i]!.revenue;
      if (prev > 0) {
        growthRates.push(safeDivide(curr - prev, prev) * 100);
      }
    }

    if (growthRates.length < 3) {
      return { factor: 'growth_consistency', score: 0, metrics: {}, breakdown: { error: 'need 3+ growth periods' } };
    }

    // Statistics
    const n = growthRates.length;
    const mean = growthRates.reduce((a, b) => a + b, 0) / n;
    const variance = growthRates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const cv = safeDivide(stdDev, Math.abs(mean)) * 100; // coefficient of variation as %

    // Score: lower CV = more consistent = higher score
    // CV < 30% → excellent (100), CV > 150% → poor (0)
    let score: number;
    if (cv <= 30) score = 100;
    else if (cv <= 60) score = 80;
    else if (cv <= 100) score = 60;
    else if (cv <= 150) score = 40;
    else if (cv <= 200) score = 20;
    else score = 0;

    // Penalize negative average growth
    if (mean < 0) score = Math.max(0, score - 40);

    return {
      factor: 'growth_consistency',
      score: clamp(score, 0, 100),
      metrics: {
        revenueGrowthMean: roundToDecimal(mean, 1),
        revenueGrowthStdDev: roundToDecimal(stdDev, 1),
        revenueGrowthCV: roundToDecimal(cv, 1),
        periods: n,
      },
      breakdown: { mean: roundToDecimal(mean, 1), stdDev: roundToDecimal(stdDev, 1), cv: roundToDecimal(cv, 1), growthRates: growthRates.map(r => roundToDecimal(r, 1)) },
    };
  },
};
