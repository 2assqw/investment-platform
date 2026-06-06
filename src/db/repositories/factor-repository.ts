import { AllFactors, FactorResult } from '../../factors/factor-types';

export async function upsertFactorScores(
  db: D1Database,
  ticker: string,
  factors: AllFactors,
): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO factor_scores (ticker, factor_name, score, metrics_json, breakdown_json, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(ticker, factor_name) DO UPDATE SET
       score = excluded.score,
       metrics_json = excluded.metrics_json,
       breakdown_json = excluded.breakdown_json,
       updated_at = excluded.updated_at`,
  );

  const batch = [
    stmt.bind(ticker, factors.growthConsistency.factor, factors.growthConsistency.score, JSON.stringify(factors.growthConsistency.metrics), JSON.stringify(factors.growthConsistency.breakdown)),
    stmt.bind(ticker, factors.shareholderAlignment.factor, factors.shareholderAlignment.score, JSON.stringify(factors.shareholderAlignment.metrics), JSON.stringify(factors.shareholderAlignment.breakdown)),
    stmt.bind(ticker, factors.cashConversion.factor, factors.cashConversion.score, JSON.stringify(factors.cashConversion.metrics), JSON.stringify(factors.cashConversion.breakdown)),
  ];

  await db.batch(batch);
}

export async function getFactorScores(
  db: D1Database,
  ticker: string,
): Promise<Array<{ factor_name: string; score: number; metrics_json: string; breakdown_json: string }>> {
  const result = await db.prepare(
    'SELECT factor_name, score, metrics_json, breakdown_json FROM factor_scores WHERE ticker = ?',
  ).bind(ticker).all<{ factor_name: string; score: number; metrics_json: string; breakdown_json: string }>();
  return result.results;
}
