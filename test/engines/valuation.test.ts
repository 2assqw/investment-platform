import { describe, it, expect } from 'vitest';
import { computeValuationScore } from '../../src/engines/valuation-engine';
import { ValuationBenchmarkRow } from '../../src/types';

function makeBench(overrides: Partial<ValuationBenchmarkRow> = {}): ValuationBenchmarkRow {
  return {
    sector: 'Technology',
    benchmark_type: 'sector',
    pe_median: 25,
    pe_p75: 40,
    ps_median: 8,
    ps_p75: 15,
    updated_at: '',
    ...overrides,
  };
}

describe('computeValuationScore', () => {
  const sectorBench = makeBench();
  const marketBench = makeBench({
    sector: 'ALL',
    benchmark_type: 'market',
    pe_median: 20,
    pe_p75: 35,
    ps_median: 6,
    ps_p75: 12,
  });

  it('returns 0-100 score', () => {
    const result = computeValuationScore(20, 7, sectorBench, marketBench);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('scores cheap stock (low PE/PS) higher', () => {
    const cheap = computeValuationScore(10, 3, sectorBench, marketBench);
    const expensive = computeValuationScore(50, 20, sectorBench, marketBench);
    expect(cheap.score).toBeGreaterThan(expensive.score);
  });

  it('returns breakdown with pe and ps details', () => {
    const result = computeValuationScore(20, 7, sectorBench, marketBench);
    const b = result.breakdown as Record<string, Record<string, number>>;
    expect(b.pe).toBeDefined();
    expect(b.ps).toBeDefined();
    expect(b.pe.sectorPercentile).toBeDefined();
    expect(b.pe.marketPercentile).toBeDefined();
    expect(b.pe.weightedPercentile).toBeDefined();
  });

  it('handles zero PE gracefully', () => {
    const result = computeValuationScore(0, 7, sectorBench, marketBench);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
