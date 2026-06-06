import { Env } from '../types';
import { getScoreHistory, getScoreChanges, getTrendingCompanies } from '../db';

export async function handleHistory(
  _request: Request, env: Env, ticker: string,
): Promise<Response> {
  const rows = await getScoreHistory(env.DB, ticker);
  if (rows.length === 0) return Response.json({ ticker: ticker.toUpperCase(), history: [] });
  return Response.json({
    ticker: ticker.toUpperCase(),
    history: rows.map(r => ({
      date: r.created_at, overall: r.overall_score, quality: r.quality_score,
      growth: r.growth_score, valuation: r.valuation_score, risk: r.risk_score,
      trust: r.trust_score, growthConsistency: r.growth_consistency,
      shareholderAlignment: r.shareholder_alignment, cashConversion: r.cash_conversion,
    })),
  });
}

export async function handleHistoryChanges(
  _request: Request, env: Env, ticker: string,
): Promise<Response> {
  const result = await getScoreChanges(env.DB, ticker);
  if (!result) return Response.json({ ticker: ticker.toUpperCase(), message: 'need at least 2 data points' });
  return Response.json({ ticker: ticker.toUpperCase(), ...result });
}

export async function handleHistoryTrends(
  _request: Request, env: Env, ticker: string,
): Promise<Response> {
  const result = await getScoreChanges(env.DB, ticker);
  if (!result) return Response.json({ ticker: ticker.toUpperCase(), trends: [] });
  return Response.json({ ticker: ticker.toUpperCase(), trends: result.trends });
}

export async function handleTrendingRankings(
  _request: Request, env: Env,
): Promise<Response> {
  const results = await getTrendingCompanies(env.DB, 20);
  return Response.json({ count: results.length, results });
}
