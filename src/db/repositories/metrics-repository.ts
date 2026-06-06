import { MetricRow, MetricBreakdownRow } from '../../types';

export async function getMetrics(
  db: D1Database,
  ticker: string,
): Promise<MetricRow | null> {
  return db
    .prepare('SELECT * FROM metrics WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<MetricRow>();
}

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

export async function getMetricDetails(
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

export async function upsertMetricDetails(
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
