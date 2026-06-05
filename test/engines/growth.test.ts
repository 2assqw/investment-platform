import { describe, it, expect } from 'vitest';
import { growthEngine } from '../../src/engines/growth-engine';
import { multiYearData } from '../helpers';

describe('Growth Engine', () => {
  it('returns 0-100 score with 4+ years of data', () => {
    const financials = multiYearData(4);
    const result = growthEngine.calculate({ ticker: 'TEST', financials });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns 0 with insufficient data (< 4 years)', () => {
    const financials = multiYearData(2);
    const result = growthEngine.calculate({ ticker: 'TEST', financials });
    expect(result.score).toBe(0);
  });

  it('returns breakdown with revenue, eps, and fcf CAGRs', () => {
    const financials = multiYearData(4);
    const result = growthEngine.calculate({ ticker: 'TEST', financials });
    const b = result.breakdown as Record<string, { value: number; score: number }>;
    expect(b.revenueCagr).toBeDefined();
    expect(b.epsCagr).toBeDefined();
    expect(b.fcfCagr).toBeDefined();
  });

  it('computes positive CAGR for growing company', () => {
    const financials = multiYearData(4);
    const result = growthEngine.calculate({ ticker: 'TEST', financials });
    const b = result.breakdown as Record<string, { value: number; score: number }>;
    // 15% annual growth should yield positive CAGR
    expect(b.revenueCagr!.value).toBeGreaterThan(0);
  });

  it('handles zero denominator for EPS (no shares)', () => {
    const financials = multiYearData(4, { shares_outstanding: 0 });
    const result = growthEngine.calculate({ ticker: 'TEST', financials });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
