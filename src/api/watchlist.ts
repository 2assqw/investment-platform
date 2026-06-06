import { Env } from '../types';
import { addToWatchlist, getWatchlist, removeFromWatchlist, getWatchlistAlerts } from '../watchlist/watchlist-service';
import { getOpportunities } from '../opportunities/opportunity-engine';

export async function handleAddWatchlist(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { ticker?: string; targetOverall?: number; targetValuation?: number; targetQuality?: number; targetGrowth?: number };
    if (!body.ticker) return Response.json({ error: 'ticker required' }, { status: 400 });
    await addToWatchlist(env.DB, body.ticker, body);
    return Response.json({ success: true });
  } catch { return Response.json({ success: false, error: 'invalid JSON' }, { status: 400 }); }
}

export async function handleGetWatchlist(_r: Request, env: Env): Promise<Response> {
  const items = await getWatchlist(env.DB);
  return Response.json({ count: items.length, items: items.map(i => ({ ticker: i.ticker, targetOverall: i.target_overall, targetValuation: i.target_valuation, targetQuality: i.target_quality, targetGrowth: i.target_growth })) });
}

export async function handleDeleteWatchlist(_r: Request, env: Env, ticker: string): Promise<Response> {
  await removeFromWatchlist(env.DB, ticker);
  return Response.json({ success: true });
}

export async function handleWatchlistAlerts(_r: Request, env: Env): Promise<Response> {
  const alerts = await getWatchlistAlerts(env.DB);
  return Response.json({ count: alerts.length, alerts });
}

export async function handleOpportunities(_r: Request, env: Env): Promise<Response> {
  const results = await getOpportunities(env.DB);
  return Response.json({ count: results.length, results });
}
