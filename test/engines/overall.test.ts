import { describe, it, expect } from 'vitest';
import { overallEngine } from '../../src/engines/overall-engine';
import { makeFinancialRow } from '../helpers';

describe('Overall Engine', () => {
  it('returns 0-100 score', () => {
    const result = overallEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow()],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns breakdown with all four sub-engine scores and weights', () => {
    const result = overallEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow()],
    });
    const b = result.breakdown as Record<string, { score: number; weight: number }>;
    expect(b.quality).toBeDefined();
    expect(b.growth).toBeDefined();
    expect(b.valuation).toBeDefined();
    expect(b.risk).toBeDefined();
    expect(b.quality!.weight).toBe(0.25);
    expect(b.growth!.weight).toBe(0.25);
    expect(b.valuation!.weight).toBe(0.30);
    expect(b.risk!.weight).toBe(0.20);
  });

  it('overall score is weighted average of sub-scores', () => {
    const result = overallEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow()],
    });
    const b = result.breakdown as Record<string, { score: number; weight: number }>;
    const expected = Math.round(
      b.quality!.score * 0.25 +
      b.growth!.score * 0.25 +
      b.valuation!.score * 0.30 +
      b.risk!.score * 0.20,
    );
    expect(result.score).toBe(expected);
  });
});
