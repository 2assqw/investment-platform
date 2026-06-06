import {
  MetricBreakdownRow,
  ValuationBenchmarkRow,
} from '../../types';
import { getMetricDetails, upsertMetricDetails } from './metrics-repository';

// ============================================================
// Valuation metrics — stored in metric_breakdowns (engine='valuation')
// ============================================================

export async function getValuationMetrics(
  db: D1Database,
  ticker: string,
): Promise<MetricBreakdownRow[]> {
  const result = await db
    .prepare(
      'SELECT * FROM metric_breakdowns WHERE ticker = ? AND engine = ? ORDER BY metric_name',
    )
    .bind(ticker.toUpperCase(), 'valuation')
    .all<MetricBreakdownRow>();
  return result.results;
}

export async function upsertValuationMetrics(
  db: D1Database,
  ticker: string,
  breakdowns: Array<{ name: string; value: number; score: number }>,
): Promise<void> {
  await upsertMetricDetails(db, ticker, 'valuation', breakdowns);
}

// ============================================================
// Valuation benchmarks — stored in valuation_benchmarks table
// ============================================================

export async function getBenchmarks(
  db: D1Database,
  sector: string,
): Promise<ValuationBenchmarkRow[]> {
  const result = await db
    .prepare('SELECT * FROM valuation_benchmarks WHERE sector = ?')
    .bind(sector)
    .all<ValuationBenchmarkRow>();
  return result.results;
}

export async function upsertBenchmarks(
  db: D1Database,
  row: ValuationBenchmarkRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO valuation_benchmarks (sector, benchmark_type, pe_median, pe_p25, pe_p75, ps_median, ps_p25, ps_p75, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(sector, benchmark_type) DO UPDATE SET
         pe_median = excluded.pe_median,
         pe_p25 = excluded.pe_p25,
         pe_p75 = excluded.pe_p75,
         ps_median = excluded.ps_median,
         ps_p25 = excluded.ps_p25,
         ps_p75 = excluded.ps_p75,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.sector,
      row.benchmark_type,
      row.pe_median,
      row.pe_p25 ?? 0,
      row.pe_p75,
      row.ps_median,
      row.ps_p25 ?? 0,
      row.ps_p75,
    )
    .run();
}
