import { Env } from '../types';
import { getPrices, getForwardReturns } from '../providers/price-provider';

export async function handlePrices(_r: Request, env: Env, ticker: string): Promise<Response> {
  const prices = await getPrices(env.DB, ticker, 500);
  if (prices.length === 0) return Response.json({ ticker: ticker.toUpperCase(), prices: [], note: 'No price data. Set FMP_API_KEY and run fetch-prices cron.' });
  return Response.json({
    ticker: ticker.toUpperCase(),
    count: prices.length,
    latest: prices[0],
    prices,
  });
}

export async function handleReturns(_r: Request, env: Env, ticker: string): Promise<Response> {
  const returns = await getForwardReturns(env.DB, ticker, 500);
  if (returns.length === 0) return Response.json({ ticker: ticker.toUpperCase(), returns: [], note: 'Need 365+ days of price data to compute forward returns.' });
  return Response.json({
    ticker: ticker.toUpperCase(),
    count: returns.length,
    latest: returns[0] ? { date: returns[0].base_date, r30: Math.round(returns[0].return_30d! * 10) / 10, r90: Math.round(returns[0].return_90d! * 10) / 10, r180: Math.round(returns[0].return_180d! * 10) / 10, r365: Math.round(returns[0].return_365d * 10) / 10 } : null,
    returns: returns.slice(0, 100).map(r => ({ date: r.base_date, r30d: Math.round(r.return_30d! * 10) / 10, r90d: Math.round(r.return_90d! * 10) / 10, r180d: Math.round(r.return_180d! * 10) / 10, r365d: Math.round(r.return_365d * 10) / 10 })),
  });
}

export async function handleBenchmark(_r: Request, env: Env): Promise<Response> {
  const spy = await getPrices(env.DB, 'SPY', 500);
  if (spy.length === 0) return Response.json({ benchmark: 'SPY', prices: [], note: 'No SPY data. Fetch with price cron.' });
  const spyReturns = await getForwardReturns(env.DB, 'SPY', 500);
  return Response.json({
    benchmark: 'SPY',
    prices: spy.length,
    returns: spyReturns.length,
    latest: spy[0] ? { date: spy[0].date, close: spy[0].close_price } : null,
  });
}
