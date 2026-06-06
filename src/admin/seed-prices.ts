import { Env } from '../types';
import { fetchAllPrices, insertPrices } from '../providers/price-provider';
import { upsertPrices, getPriceCoverage, validatePrices } from '../db/prices';

export const PRICE_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN',
  'XOM', 'CVX', 'FCX', 'JPM', 'BAC',
  'COST', 'WMT', 'JNJ', 'UNH', 'O', 'PLD',
  'SPY', 'QQQ',
];

export async function handleSeedPrices(_req: Request, env: Env, ticker: string): Promise<Response> {
  const upper = ticker.toUpperCase();
  try {
    const prices = await fetchAllPrices(upper, env as unknown as Record<string, unknown>);
    if (prices.length === 0) {
      return Response.json({ ok: false, ticker: upper, error: 'No data. Sources tried: FMP→AlphaVantage→Tencent. Set ALPHA_VANTAGE_KEY for more coverage.' }, { status: 404 });
    }
    const count = await insertPrices(env.DB, prices);
    const dates = prices.map(r => r.date).sort();
    return Response.json({ ok: true, ticker: upper, rowsInserted: count, source: prices[0]?.source, startDate: dates[0]??'', endDate: dates[dates.length-1]??'' });
  } catch (e) { return Response.json({ ok: false, ticker: upper, error: String(e) }, { status: 500 }); }
}

export async function handleSeedBenchmarks(env: Env): Promise<Response> {
  const results: Array<{ ticker: string; rows: number; startDate: string; endDate: string }> = [];
  for (const ticker of PRICE_UNIVERSE) {
    try {
      const prices = await fetchAllPrices(ticker, env as unknown as Record<string, unknown>);
      if (prices.length > 0) {
        await insertPrices(env.DB, prices);
        const dates = prices.map(r => r.date).sort();
        results.push({ ticker, rows: prices.length, startDate: dates[0]!, endDate: dates[dates.length-1]! });
      }
    } catch { /* skip */ }
  }
  return Response.json({ ok: true, seeded: results.length, total: PRICE_UNIVERSE.length, results });
}

export async function handlePriceCoverage(env: Env): Promise<Response> {
  const coverage = await getPriceCoverage(env.DB);
  const totalRows = coverage.reduce((s, c) => s + c.row_count, 0);
  return Response.json({ tickers: coverage.length, rows: totalRows, coverage });
}

export async function handleValidatePrices(env: Env): Promise<Response> {
  const result = await validatePrices(env.DB);
  return Response.json(result);
}
