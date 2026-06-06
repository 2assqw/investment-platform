export interface PriceRow {
  ticker: string; date: string; open_price: number; high_price: number;
  low_price: number; close_price: number; adjusted_close: number; volume: number; source: string;
}

function key(env: Record<string, unknown> | undefined, name: string): string {
  if (!env) return ''; const v = env[name]; return typeof v === 'string' ? v : '';
}

async function fetchFMP(ticker: string, env?: Record<string, unknown>): Promise<PriceRow[]> {
  const k = key(env, 'FMP_API_KEY'); if (!k) return [];
  const to = new Date().toISOString().split('T')[0]!;
  try {
    const res = await fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?from=2015-01-01&to=${to}&apikey=${k}`);
    if (!res.ok) return [];
    const data = await res.json() as { historical?: Array<{ date: string; open: number; high: number; low: number; close: number; adjClose: number; volume: number }> };
    if (!data.historical) return [];
    return data.historical.map(p => ({ ticker: ticker.toUpperCase(), date: p.date, open_price: p.open, high_price: p.high, low_price: p.low, close_price: p.close, adjusted_close: p.adjClose, volume: p.volume, source: 'fmp' }));
  } catch { return []; }
}

async function fetchAlphaVantage(ticker: string, env?: Record<string, unknown>): Promise<PriceRow[]> {
  const k = key(env, 'ALPHA_VANTAGE_KEY') || key(env, 'ALPHA_VANTAGE_API_KEY');
  if (!k || k === 'demo') return [];
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=full&apikey=${k}`);
    const data = await res.json() as Record<string, unknown>;
    if (data['Information'] || data['Note'] || data['Error Message']) return [];
    const ts = data['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
    if (!ts) return [];
    return Object.entries(ts).map(([date, v]) => {
      const c = parseFloat(v['5. adjusted close'] ?? v['4. close'] ?? '0');
      return { ticker: ticker.toUpperCase(), date, open_price: parseFloat(v['1. open']??'0')||c, high_price: parseFloat(v['2. high']??'0')||c, low_price: parseFloat(v['3. low']??'0')||c, close_price: c, adjusted_close: c, volume: parseInt(v['6. volume']??'0',10)||0, source: 'alpha-vantage' };
    }).filter(r => r.close_price > 0);
  } catch { return []; }
}

async function fetchTencent(ticker: string): Promise<PriceRow[]> {
  try {
    const res = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=us${ticker.toUpperCase()},day,2020-01-01,,1000,qfq`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const day = data?.data?.[`us${ticker.toUpperCase()}`]?.day;
    if (!day || !Array.isArray(day)) return [];
    return day.map((r: string[]) => {
      const c = parseFloat(r[2]??'0');
      return { ticker: ticker.toUpperCase(), date: r[0]??'', open_price: parseFloat(r[1]??'0')||c, close_price: c, high_price: parseFloat(r[3]??'0')||c, low_price: parseFloat(r[4]??'0')||c, adjusted_close: c, volume: parseInt(r[5]??'0',10)||0, source: 'tencent' };
    }).filter(r => r.close_price > 0);
  } catch { return []; }
}

export async function fetchAllPrices(ticker: string, env?: Record<string, unknown>): Promise<PriceRow[]> {
  // Try all sources in priority order
  for (const fn of [() => fetchFMP(ticker, env), () => fetchAlphaVantage(ticker, env), () => fetchTencent(ticker)]) {
    const rows = await fn();
    if (rows.length > 0) return rows;
  }
  return [];
}

export async function fetchHistoricalPrices(ticker: string, from: string, to: string, env?: Record<string, unknown>): Promise<PriceRow[]> {
  return fetchAllPrices(ticker, env);
}

export async function insertPrices(db: D1Database, prices: PriceRow[]): Promise<number> {
  if (prices.length === 0) return 0;
  const batch = prices.slice(0, 2000);
  const stmt = db.prepare(`INSERT OR REPLACE INTO price_history (ticker, date, open_price, high_price, low_price, close_price, adjusted_close, volume, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
  for (let i = 0; i < batch.length; i += 50) {
    const b = batch.slice(i, i + 50).map(p => stmt.bind(p.ticker, p.date, p.open_price, p.high_price, p.low_price, p.close_price, p.adjusted_close, p.volume, p.source));
    await db.batch(b);
  }
  return batch.length;
}

export async function computeForwardReturns(db: D1Database, ticker: string): Promise<number> { return 0; }

export async function getPrices(db: D1Database, ticker: string, limit = 500) {
  return (await db.prepare('SELECT * FROM price_history WHERE ticker=? ORDER BY date DESC LIMIT ?').bind(ticker.toUpperCase(), limit).all<PriceRow>()).results;
}

export async function getForwardReturns(db: D1Database, ticker: string, limit = 500) {
  return (await db.prepare('SELECT * FROM forward_returns WHERE ticker=? ORDER BY base_date DESC LIMIT ?').bind(ticker.toUpperCase(), limit).all<{ ticker: string; base_date: string; return_30d: number; return_90d: number; return_180d: number; return_365d: number }>()).results;
}
