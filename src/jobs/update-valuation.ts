import { DataProvider, PriceData } from '../providers';
import { computeValuationScore } from '../engines/valuation-engine';
import { overallEngine } from '../engines/overall-engine';
import {
  getFinancials,
  getMetrics,
  getCompanySector,
  upsertMetrics,
  upsertBenchmarks,
  upsertValuationMetrics,
  getBenchmarks,
  listTickers,
} from '../db';
import { invalidateCache } from '../cache';
import { Env, FinancialRow, ValuationBenchmarkRow } from '../types';
import { safeDivide } from '../engines/scoring';
import { EngineInput } from '../engines/types';

interface TickerValuation {
  ticker: string;
  sector: string;
  pe: number;
  ps: number;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function p25(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.25)]!;
}

function p75(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)]!;
}

function breakdownToRows(breakdown: Record<string, unknown>): Array<{ name: string; value: number; score: number }> {
  const result: Array<{ name: string; value: number; score: number }> = [];
  for (const [key, val] of Object.entries(breakdown)) {
    if (
      typeof val === 'object' &&
      val !== null &&
      'value' in val &&
      'score' in val
    ) {
      const v = val as { value: number; score: number };
      // Only include leaf metrics (skip nested breakdowns)
      if (typeof v.value === 'number' && typeof v.score === 'number') {
        result.push({ name: key, value: v.value, score: v.score });
      }
    }
  }
  return result;
}

/**
 * Build PE/PS for each ticker using live price data + latest financials.
 */
async function collectValuations(
  env: Env,
  provider: DataProvider,
  tickers: string[],
): Promise<TickerValuation[]> {
  const results: TickerValuation[] = [];

  for (const ticker of tickers) {
    try {
      const [priceData, financials] = await Promise.all([
        provider.fetchPrice({ ticker }),
        getFinancials(env.DB, ticker),
      ]);
      const latest = financials[0];
      const sector = (await getCompanySector(env.DB, ticker)) ?? 'Unknown';

      if (!latest || !latest.revenue || !latest.net_income) continue;

      const eps = safeDivide(latest.net_income, latest.shares_outstanding);
      const sps = safeDivide(latest.revenue, latest.shares_outstanding);
      const pe = safeDivide(priceData.price, eps);
      const ps = safeDivide(priceData.price, sps);

      if (pe > 0 && ps > 0) {
        results.push({ ticker, sector, pe, ps });
      }
    } catch {
      // Skip tickers that fail to fetch price data
    }
  }

  return results;
}

/**
 * Compute and store valuation benchmarks (sector + market).
 */
async function updateBenchmarks(
  env: Env,
  valuations: TickerValuation[],
): Promise<void> {
  // Market benchmark
  const allPEs = valuations.map((v) => v.pe);
  const allPSs = valuations.map((v) => v.ps);

  await upsertBenchmarks(env.DB, {
    sector: 'ALL',
    benchmark_type: 'market',
    pe_median: median(allPEs),
    pe_p25: p25(allPEs),
    pe_p75: p75(allPEs),
    ps_median: median(allPSs),
    ps_p25: p25(allPSs),
    ps_p75: p75(allPSs),
    updated_at: '',
  });

  // Sector benchmarks
  const bySector = new Map<string, { pes: number[]; pss: number[] }>();
  for (const v of valuations) {
    if (!bySector.has(v.sector)) {
      bySector.set(v.sector, { pes: [], pss: [] });
    }
    bySector.get(v.sector)!.pes.push(v.pe);
    bySector.get(v.sector)!.pss.push(v.ps);
  }

  for (const [sector, data] of bySector) {
    await upsertBenchmarks(env.DB, {
      sector,
      benchmark_type: 'sector',
      pe_median: median(data.pes),
      pe_p25: p25(data.pes),
      pe_p75: p75(data.pes),
      ps_median: median(data.pss),
      ps_p25: p25(data.pss),
      ps_p75: p75(data.pss),
      updated_at: '',
    });
  }
}

/**
 * Score each ticker using valuation engine + update metrics.
 */
async function scoreTickers(
  env: Env,
  valuations: TickerValuation[],
): Promise<void> {
  const [marketBench] = await getBenchmarks(env.DB, 'ALL');
  if (!marketBench) return;

  for (const v of valuations) {
    const sectorBenchs = await getBenchmarks(env.DB, v.sector);
    const sectorBench = sectorBenchs.find((b) => b.benchmark_type === 'sector');
    if (!sectorBench) continue;

    const valuationResult = computeValuationScore(v.pe, v.ps, sectorBench, marketBench);

    // Read existing scores + financials for overall recalculation
    const [existing, financials] = await Promise.all([
      getMetrics(env.DB, v.ticker),
      getFinancials(env.DB, v.ticker),
    ]);

    // Recompute overall with new valuation score
    const engineInput: EngineInput = {
      ticker: v.ticker,
      financials,
    };
    const overallResult = overallEngine.calculate(engineInput);

    // Build metrics row — update valuation + overall, preserve others
    await upsertMetrics(env.DB, {
      ticker: v.ticker,
      quality_score: existing?.quality_score ?? 0,
      growth_score: existing?.growth_score ?? 0,
      valuation_score: valuationResult.score,
      risk_score: existing?.risk_score ?? 0,
      overall_score: overallResult.score,
      consistency_score: existing?.consistency_score ?? 0,
      updated_at: '',
    });

    // Store valuation breakdown
    await upsertValuationMetrics(
      env.DB,
      v.ticker,
      breakdownToRows(valuationResult.breakdown),
    );

    // Invalidate cache for this ticker
    await invalidateCache(v.ticker, env.KV);
  }
}

/**
 * Daily cron job: fetch prices → update benchmarks → score valuations → invalidate cache.
 */
export async function updateValuation(
  env: Env,
  provider: DataProvider,
): Promise<void> {
  const tickers = await listTickers(env.DB);
  if (tickers.length === 0) return;

  console.log(`[update-valuation] Processing ${tickers.length} tickers...`);

  const valuations = await collectValuations(env, provider, tickers);
  console.log(`[update-valuation] Collected ${valuations.length} valuations`);

  await updateBenchmarks(env, valuations);
  console.log('[update-valuation] Benchmarks updated');

  await scoreTickers(env, valuations);
  console.log('[update-valuation] Scores + cache invalidation complete');
}
