import { Factor, FactorInput, FactorResult } from './factor-types';
import { safeDivide, clamp, roundToDecimal, cagr } from '../engines/scoring';

/**
 * Factor 002: Shareholder Alignment
 * Measures whether management is returning capital (buybacks) or diluting (issuance).
 * Negative share CAGR = buybacks = good. Positive = dilution = bad.
 */
export const shareholderAlignmentFactor: Factor = {
  name: 'shareholder_alignment',

  calculate(input: FactorInput): FactorResult {
    const sorted = [...input.financials].sort((a, b) => a.fiscal_year - a.fiscal_year);
    if (sorted.length < 5) {
      return { factor: 'shareholder_alignment', score: 0, metrics: {}, breakdown: { error: 'need 5+ years' } };
    }

    // Take last 5 years for share count trend
    const recent = sorted.slice(-5);
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;

    if (first.shares_outstanding <= 0 || last.shares_outstanding <= 0) {
      return { factor: 'shareholder_alignment', score: 0, metrics: {}, breakdown: { error: 'missing share data' } };
    }

    const shareCagr = cagr(first.shares_outstanding, last.shares_outstanding, 4) * 100; // as %

    // Year-over-year changes
    const yoyChanges: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1]!.shares_outstanding;
      const curr = recent[i]!.shares_outstanding;
      yoyChanges.push(safeDivide(curr - prev, prev) * 100);
    }

    const reduceCount = yoyChanges.filter(c => c < -0.5).length;
    const increaseCount = yoyChanges.filter(c => c > 0.5).length;
    const maxDilution = Math.max(...yoyChanges, 0);

    // Score: aggressive buybacks = high score, dilution = low score
    let score: number;
    if (shareCagr <= -5) score = 100;      // 5%+ annual buyback
    else if (shareCagr <= -2) score = 80;   // 2-5% buyback
    else if (shareCagr <= 0) score = 60;    // flat to slight buyback
    else if (shareCagr <= 2) score = 40;    // slight dilution
    else if (shareCagr <= 5) score = 20;    // moderate dilution
    else score = 0;                          // heavy dilution

    // Bonus for consistent buybacks (all 4 years reducing)
    if (reduceCount >= 4) score = Math.min(100, score + 10);

    return {
      factor: 'shareholder_alignment',
      score: clamp(score, 0, 100),
      metrics: {
        shareCagr: roundToDecimal(shareCagr, 1),
        reduceYears: reduceCount,
        increaseYears: increaseCount,
        maxDilution: roundToDecimal(maxDilution, 1),
        firstShares: first.shares_outstanding,
        lastShares: last.shares_outstanding,
      },
      breakdown: {
        shareCagr: roundToDecimal(shareCagr, 1),
        reduceYears: reduceCount,
        increaseYears: increaseCount,
        yoyChanges: yoyChanges.map(c => roundToDecimal(c, 1)),
      },
    };
  },
};
