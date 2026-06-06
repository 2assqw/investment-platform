import { getMetrics, getFactorScores, getScoreHistory } from '../db';
import { Opportunity } from './opportunity-types';

export async function generateOpportunities(db: D1Database): Promise<Opportunity[]> {
  // Only check tickers with history (max 15 to stay within subrequest limits)
  const tickers = await db.prepare(
    'SELECT DISTINCT ticker FROM score_history WHERE created_at > datetime("now", "-2 days") LIMIT 15'
  ).all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  if (tickers.length === 0) {
    // Fallback: use metrics table
    const m = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0 LIMIT 10')
      .all<{ ticker: string }>();
    tickers.push(...m.results.map(r => r.ticker));
  }

  const ops: Opportunity[] = [];

  for (const ticker of tickers) {
    try {
      const metrics = await getMetrics(db, ticker);
      if (!metrics) continue;

      if (metrics.quality_score >= 80) {
        ops.push({ ticker, type: 'new_high_quality', message: 'Quality score reached 80+.', impact: 'positive', createdAt: new Date().toISOString() });
      }

      // Check history for changes
      const history = await getScoreHistory(db, ticker, 2);
      if (history.length >= 2) {
        const latest = history[0]!;
        const prev = history[1]!;
        if (latest.overall_score - prev.overall_score >= 10) {
          ops.push({ ticker, type: 'score_improvement', message: `Overall score improved by ${latest.overall_score - prev.overall_score} points.`, impact: 'positive', createdAt: new Date().toISOString() });
        }
        if (latest.valuation_score - prev.valuation_score >= 15) {
          ops.push({ ticker, type: 'valuation_expansion', message: `Valuation became more attractive (+${latest.valuation_score - prev.valuation_score}).`, impact: 'positive', createdAt: new Date().toISOString() });
        }
      }

      const factors = await getFactorScores(db, ticker);
      const gcScore = factors.find(f => f.factor_name === 'growth_consistency')?.score ?? 0;
      if (gcScore >= 80) {
        ops.push({ ticker, type: 'new_compounder', message: 'Growth consistency reached elite level.', impact: 'positive', createdAt: new Date().toISOString() });
      }

    } catch { /* skip */ }
  }

  return ops;
}

export async function persistOpportunities(db: D1Database, ops: Opportunity[]): Promise<void> {
  if (ops.length === 0) return;
  const stmt = db.prepare(
    'INSERT INTO opportunities (ticker, type, message, impact, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
  );
  const batch = ops.map(o => stmt.bind(o.ticker, o.type, o.message, o.impact));
  await db.batch(batch);
}

export async function getOpportunities(db: D1Database, limit: number = 20): Promise<Opportunity[]> {
  const r = await db.prepare('SELECT * FROM opportunities ORDER BY created_at DESC LIMIT ?').bind(limit).all<{ ticker: string; type: string; message: string; impact: string; created_at: string }>();
  return r.results.map(o => ({ ticker: o.ticker, type: o.type, message: o.message, impact: o.impact as Opportunity['impact'], createdAt: o.created_at }));
}
