import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide } from './scoring';
import { ValuationBenchmarkRow } from '../types';

function percentileToScore(percentile: number): number {
  if (percentile <= 10) return 100;
  if (percentile <= 25) return 75;
  if (percentile <= 50) return 50;
  if (percentile <= 75) return 25;
  return 0;
}

function computePercentile(value: number, median: number, p75: number): number {
  if (value <= 0 || median <= 0) return 50;
  if (value <= median) {
    return Math.max(1, safeDivide(value, median) * 50);
  }
  if (p75 <= median) return 75;
  return Math.min(99, 50 + safeDivide(value - median, p75 - median) * 25);
}

/**
 * Pure scoring function used by the cron job.
 * Takes pre-computed PE/PS + benchmarks, returns score + breakdown.
 */
export function computeValuationScore(
  pe: number,
  ps: number,
  sectorBench: ValuationBenchmarkRow,
  marketBench: ValuationBenchmarkRow,
): EngineOutput {
  const peSectorPct = computePercentile(pe, sectorBench.pe_median, sectorBench.pe_p75);
  const peMarketPct = computePercentile(pe, marketBench.pe_median, marketBench.pe_p75);
  const psSectorPct = computePercentile(ps, sectorBench.ps_median, sectorBench.ps_p75);
  const psMarketPct = computePercentile(ps, marketBench.ps_median, marketBench.ps_p75);

  // 70% sector + 30% market weighted percentile
  const peWeighted = peSectorPct * 0.7 + peMarketPct * 0.3;
  const psWeighted = psSectorPct * 0.7 + psMarketPct * 0.3;

  const peScore = percentileToScore(peWeighted);
  const psScore = percentileToScore(psWeighted);

  const totalScore = clamp(Math.round(peScore * 0.5 + psScore * 0.5), 0, 100);

  return {
    score: totalScore,
    breakdown: {
      pe: {
        value: roundToDecimal(pe, 1),
        sectorPercentile: roundToDecimal(peSectorPct, 1),
        marketPercentile: roundToDecimal(peMarketPct, 1),
        weightedPercentile: roundToDecimal(peWeighted, 1),
        score: peScore,
      },
      ps: {
        value: roundToDecimal(ps, 1),
        sectorPercentile: roundToDecimal(psSectorPct, 1),
        marketPercentile: roundToDecimal(psMarketPct, 1),
        weightedPercentile: roundToDecimal(psWeighted, 1),
        score: psScore,
      },
    },
  };
}

export const valuationEngine: Engine = {
  name: 'valuation',

  calculate(input: EngineInput): EngineOutput {
    // The valuation engine requires PE/PS which needs live price data.
    // This calculate() is a stub — the cron job calls computeValuationScore()
    // directly after computing PE/PS from price provider.
    return {
      score: 0,
      breakdown: { note: 'valuation requires live price data; use computeValuationScore() in cron' },
    };
  },
};
