import {
  CompanyRow,
  FinancialRow,
  MetricRow,
  MetricBreakdownRow,
  ValuationBenchmarkRow,
} from '../types';

// ============================================================
// Read queries
// ============================================================

export async function getCompany(
  db: D1Database,
  ticker: string,
): Promise<CompanyRow | null> {
  return db
    .prepare('SELECT * FROM companies WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<CompanyRow>();
}

export async function getMetrics(
  db: D1Database,
  ticker: string,
): Promise<MetricRow | null> {
  return db
    .prepare('SELECT * FROM metrics WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<MetricRow>();
}

export async function getMetricBreakdowns(
  db: D1Database,
  ticker: string,
): Promise<MetricBreakdownRow[]> {
  const result = await db
    .prepare(
      'SELECT * FROM metric_breakdowns WHERE ticker = ? ORDER BY engine, metric_name',
    )
    .bind(ticker.toUpperCase())
    .all<MetricBreakdownRow>();
  return result.results;
}

export async function getFinancials(
  db: D1Database,
  ticker: string,
  fiscalYear?: number,
): Promise<FinancialRow[]> {
  if (fiscalYear !== undefined) {
    const result = await db
      .prepare(
        'SELECT * FROM financials WHERE ticker = ? AND fiscal_year = ? ORDER BY fiscal_year DESC',
      )
      .bind(ticker.toUpperCase(), fiscalYear)
      .all<FinancialRow>();
    return result.results;
  }
  const result = await db
    .prepare(
      'SELECT * FROM financials WHERE ticker = ? ORDER BY fiscal_year DESC',
    )
    .bind(ticker.toUpperCase())
    .all<FinancialRow>();
  return result.results;
}

export async function getAllTickers(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT ticker FROM companies')
    .all<{ ticker: string }>();
  return result.results.map((r) => r.ticker);
}

export async function getCompanySector(
  db: D1Database,
  ticker: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT sector FROM companies WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<{ sector: string }>();
  return row?.sector ?? null;
}

export async function getValuationBenchmarks(
  db: D1Database,
  sector: string,
): Promise<ValuationBenchmarkRow[]> {
  const result = await db
    .prepare('SELECT * FROM valuation_benchmarks WHERE sector = ?')
    .bind(sector)
    .all<ValuationBenchmarkRow>();
  return result.results;
}

// ============================================================
// Write queries
// ============================================================

export async function upsertMetrics(db: D1Database, row: MetricRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO metrics (ticker, quality_score, growth_score, valuation_score, risk_score, overall_score, consistency_score, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(ticker) DO UPDATE SET
         quality_score = excluded.quality_score,
         growth_score = excluded.growth_score,
         valuation_score = excluded.valuation_score,
         risk_score = excluded.risk_score,
         overall_score = excluded.overall_score,
         consistency_score = excluded.consistency_score,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.ticker,
      row.quality_score,
      row.growth_score,
      row.valuation_score,
      row.risk_score,
      row.overall_score,
      row.consistency_score,
    )
    .run();
}

export async function replaceMetricBreakdowns(
  db: D1Database,
  ticker: string,
  engine: string,
  breakdowns: Array<{ name: string; value: number; score: number }>,
): Promise<void> {
  await db
    .prepare('DELETE FROM metric_breakdowns WHERE ticker = ? AND engine = ?')
    .bind(ticker, engine)
    .run();

  if (breakdowns.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO metric_breakdowns (ticker, metric_name, metric_value, metric_score, engine, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  );

  const batch = breakdowns.map((b) =>
    stmt.bind(ticker, b.name, b.value, b.score, engine),
  );
  await db.batch(batch);
}

export async function upsertValuationBenchmark(
  db: D1Database,
  row: ValuationBenchmarkRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO valuation_benchmarks (sector, benchmark_type, pe_median, pe_p75, ps_median, ps_p75, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(sector, benchmark_type) DO UPDATE SET
         pe_median = excluded.pe_median,
         pe_p75 = excluded.pe_p75,
         ps_median = excluded.ps_median,
         ps_p75 = excluded.ps_p75,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.sector,
      row.benchmark_type,
      row.pe_median,
      row.pe_p75,
      row.ps_median,
      row.ps_p75,
    )
    .run();
}

export async function upsertFinancials(
  db: D1Database,
  financials: FinancialRow[],
): Promise<void> {
  if (financials.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO financials (ticker, fiscal_year, revenue, gross_profit, operating_income, net_income, operating_cash_flow, free_cash_flow, total_assets, total_liabilities, shareholder_equity, shares_outstanding)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ticker, fiscal_year) DO UPDATE SET
       revenue = excluded.revenue,
       gross_profit = excluded.gross_profit,
       operating_income = excluded.operating_income,
       net_income = excluded.net_income,
       operating_cash_flow = excluded.operating_cash_flow,
       free_cash_flow = excluded.free_cash_flow,
       total_assets = excluded.total_assets,
       total_liabilities = excluded.total_liabilities,
       shareholder_equity = excluded.shareholder_equity,
       shares_outstanding = excluded.shares_outstanding`,
  );

  const batch = financials.map((f) =>
    stmt.bind(
      f.ticker,
      f.fiscal_year,
      f.revenue,
      f.gross_profit,
      f.operating_income,
      f.net_income,
      f.operating_cash_flow,
      f.free_cash_flow,
      f.total_assets,
      f.total_liabilities,
      f.shareholder_equity,
      f.shares_outstanding,
    ),
  );
  await db.batch(batch);
}
