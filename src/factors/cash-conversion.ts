import { Factor, FactorInput, FactorResult } from './factor-types';
import { safeDivide, clamp, roundToDecimal } from '../engines/scoring';

/**
 * Factor 003: Cash Conversion
 * Measures earnings quality: how much of net income converts to operating cash flow.
 * OCF/NI ratio. 1.0-1.5 is ideal. < 0.6 is a red flag.
 */
export const cashConversionFactor: Factor = {
  name: 'cash_conversion',

  calculate(input: FactorInput): FactorResult {
    const sorted = [...input.financials].sort((a, b) => a.fiscal_year - a.fiscal_year);
    if (sorted.length < 3) {
      return { factor: 'cash_conversion', score: 0, metrics: {}, breakdown: { error: 'need 3+ years' } };
    }

    // Take last 5 years (or all available)
    const recent = sorted.slice(-Math.min(5, sorted.length));

    const ratios: number[] = [];
    for (const row of recent) {
      if (row.net_income > 0 && row.operating_cash_flow > 0) {
        ratios.push(safeDivide(row.operating_cash_flow, row.net_income));
      }
    }

    if (ratios.length < 2) {
      return { factor: 'cash_conversion', score: 0, metrics: {}, breakdown: { error: 'need 2+ years with positive NI and OCF' } };
    }

    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const sortedRatios = [...ratios].sort((a, b) => a - b);
    const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)]!;
    const worstRatio = sortedRatios[0]!;

    // Score: 1.0-1.5 is ideal, < 0.6 is warning
    // Too high (>2.0) might indicate unusual working capital changes
    let score: number;
    if (avgRatio >= 1.0 && avgRatio <= 1.5) {
      score = 100;
    } else if (avgRatio >= 0.8 && avgRatio < 1.0) {
      score = 75;
    } else if (avgRatio >= 0.6 && avgRatio < 0.8) {
      score = 50;
    } else if (avgRatio > 1.5 && avgRatio <= 2.0) {
      score = 60; // high but might be legit
    } else if (avgRatio > 2.0) {
      score = 30; // unusually high — investigate
    } else {
      score = Math.max(0, Math.round(avgRatio * 80)); // < 0.6, linear down to 0
    }

    return {
      factor: 'cash_conversion',
      score: clamp(score, 0, 100),
      metrics: {
        averageRatio: roundToDecimal(avgRatio, 2),
        medianRatio: roundToDecimal(medianRatio, 2),
        worstRatio: roundToDecimal(worstRatio, 2),
        periods: ratios.length,
      },
      breakdown: { ratios: ratios.map(r => roundToDecimal(r, 2)), avg: roundToDecimal(avgRatio, 2), median: roundToDecimal(medianRatio, 2), worst: roundToDecimal(worstRatio, 2) },
    };
  },
};
