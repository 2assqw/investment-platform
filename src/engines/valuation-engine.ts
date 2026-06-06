import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide } from './scoring';
import { ValuationBenchmarkRow } from '../types';

// ============================================================
// Percentile → Score mapping
// ============================================================

function percentileToScore(pct: number): number {
  // Lower percentile = cheaper = higher score
  if (pct <= 10) return 100;
  if (pct <= 25) return 80;
  if (pct <= 50) return 60;
  if (pct <= 75) return 40;
  if (pct <= 90) return 20;
  return 0;
}

function computePercentile(value: number, p25: number, median: number, p75: number): number {
  if (value <= 0 || median <= 0) return 50;
  if (value <= p25 && p25 > 0) {
    return Math.max(1, safeDivide(value, p25) * 25);
  }
  if (value <= median) {
    return 25 + safeDivide(value - p25, median - p25) * 25;
  }
  if (value <= p75 && p75 > median) {
    return 50 + safeDivide(value - median, p75 - median) * 25;
  }
  if (value <= p75 * 2) {
    return Math.min(99, 75 + safeDivide(value - p75, p75) * 15);
  }
  return 99;
}

// ============================================================
// Pure scoring function — called by cron with pre-computed PE/PS
// ============================================================

export function computeValuationScore(
  pe: number,
  ps: number,
  sectorBench: ValuationBenchmarkRow,
  marketBench: ValuationBenchmarkRow,
): EngineOutput {
  const peSectorPct = computePercentile(
    pe, sectorBench.pe_p25 ?? sectorBench.pe_median * 0.5,
    sectorBench.pe_median, sectorBench.pe_p75,
  );
  const psSectorPct = computePercentile(
    ps, sectorBench.ps_p25 ?? sectorBench.ps_median * 0.5,
    sectorBench.ps_median, sectorBench.ps_p75,
  );

  // 100% sector-based (no cross-sector comparison for now)
  const peScore = percentileToScore(peSectorPct);
  const psScore = percentileToScore(psSectorPct);

  // 50% PE + 50% PS
  const totalScore = clamp(Math.round(peScore * 0.5 + psScore * 0.5), 0, 100);

  return {
    score: totalScore,
    breakdown: {
      pe: {
        value: roundToDecimal(pe, 1),
        percentile: roundToDecimal(peSectorPct, 1),
        sectorMedian: roundToDecimal(sectorBench.pe_median, 1),
        sectorP25: roundToDecimal(sectorBench.pe_p25 ?? 0, 1),
        sectorP75: roundToDecimal(sectorBench.pe_p75, 1),
        score: peScore,
      },
      ps: {
        value: roundToDecimal(ps, 1),
        percentile: roundToDecimal(psSectorPct, 1),
        sectorMedian: roundToDecimal(sectorBench.ps_median, 1),
        sectorP25: roundToDecimal(sectorBench.ps_p25 ?? 0, 1),
        sectorP75: roundToDecimal(sectorBench.ps_p75, 1),
        score: psScore,
      },
    },
  };
}

// ============================================================
// Engine interface (called by cron with price data in EngineInput)
// ============================================================

export const valuationEngine: Engine = {
  name: 'valuation',

  calculate(input: EngineInput): EngineOutput {
    if (!input.benchmarks || input.benchmarks.length === 0) {
      return { score: 0, breakdown: { note: 'no valuation benchmarks available' } };
    }

    const latest = input.financials[input.financials.length - 1];
    if (!latest) {
      return { score: 0, breakdown: { error: 'no financial data' } };
    }

    // Market cap comes from companies table via EngineInput extension
    // For the engine interface, we use the price data passed through
    const marketCap = (input as { marketCap?: number }).marketCap ?? 0;
    if (marketCap <= 0) {
      return { score: 0, breakdown: { error: 'no market cap data' } };
    }

    const pe = safeDivide(marketCap, latest.net_income);
    const ps = safeDivide(marketCap, latest.revenue);

    // Find sector benchmark
    const sectorBench = input.benchmarks.find(b => b.benchmark_type === 'sector')
      ?? input.benchmarks[0]!;
    const marketBench = input.benchmarks.find(b => b.benchmark_type === 'market')
      ?? sectorBench;

    return computeValuationScore(pe, ps, sectorBench, marketBench);
  },
};
