import { getMetrics } from '../db';
import { WatchlistEntry, WatchlistAlert } from './watchlist-types';

const DEFAULT_USER = 'default';

export async function addToWatchlist(
  db: D1Database,
  ticker: string,
  targets: { targetOverall?: number; targetValuation?: number; targetQuality?: number; targetGrowth?: number },
): Promise<void> {
  await db.prepare(
    `INSERT INTO watchlists (user_id, ticker, target_overall, target_valuation, target_quality, target_growth, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, ticker) DO UPDATE SET
       target_overall = excluded.target_overall, target_valuation = excluded.target_valuation,
       target_quality = excluded.target_quality, target_growth = excluded.target_growth,
       updated_at = excluded.updated_at`,
  ).bind(DEFAULT_USER, ticker.toUpperCase(), targets.targetOverall ?? null, targets.targetValuation ?? null, targets.targetQuality ?? null, targets.targetGrowth ?? null).run();
}

export async function getWatchlist(db: D1Database): Promise<WatchlistEntry[]> {
  const r = await db.prepare('SELECT * FROM watchlists WHERE user_id = ?').bind(DEFAULT_USER).all<WatchlistEntry>();
  return r.results;
}

export async function removeFromWatchlist(db: D1Database, ticker: string): Promise<void> {
  await db.prepare('DELETE FROM watchlists WHERE user_id = ? AND ticker = ?').bind(DEFAULT_USER, ticker.toUpperCase()).run();
}

export async function getWatchlistAlerts(db: D1Database): Promise<WatchlistAlert[]> {
  const items = await getWatchlist(db);
  const alerts: WatchlistAlert[] = [];

  for (const item of items) {
    const m = await getMetrics(db, item.ticker);
    if (!m) continue;

    if (item.target_overall && m.overall_score >= item.target_overall) {
      alerts.push({ ticker: item.ticker, reason: 'overall_target_reached', currentOverall: m.overall_score, targetOverall: item.target_overall });
    }
    if (item.target_valuation && m.valuation_score >= item.target_valuation) {
      alerts.push({ ticker: item.ticker, reason: 'valuation_target_reached', currentOverall: m.overall_score, targetOverall: item.target_valuation });
    }
    if (item.target_quality && m.quality_score >= item.target_quality) {
      alerts.push({ ticker: item.ticker, reason: 'quality_target_reached', currentOverall: m.overall_score, targetOverall: item.target_quality });
    }
  }

  return alerts;
}
