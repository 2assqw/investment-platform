export interface DbPrice {
  ticker: string; date: string; open_price: number; high_price: number;
  low_price: number; close_price: number; volume: number; source: string;
}

export async function upsertPrices(db: D1Database, rows: Array<{
  ticker: string; date: string; open_price: number; high_price: number;
  low_price: number; close_price: number; volume: number; source: string;
}>): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO price_history (ticker, date, open_price, high_price, low_price, close_price, volume, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  );
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map(r =>
      stmt.bind(r.ticker, r.date, r.open_price, r.high_price, r.low_price, r.close_price, r.volume, r.source),
    );
    await db.batch(batch);
  }

  // Update coverage
  for (const ticker of [...new Set(rows.map(r => r.ticker))]) {
    const dates = rows.filter(r => r.ticker === ticker).map(r => r.date).sort();
    await db.prepare(
      `INSERT OR REPLACE INTO price_coverage (ticker, row_count, start_date, end_date, last_updated)
       VALUES (?, (SELECT COUNT(*) FROM price_history WHERE ticker = ?), ?, ?, datetime('now'))`,
    ).bind(ticker, ticker, dates[0] ?? '', dates[dates.length - 1] ?? '').run();
  }
  return rows.length;
}

export async function getPriceHistory(
  db: D1Database, ticker: string, limit: number = 500,
): Promise<DbPrice[]> {
  const r = await db.prepare(
    'SELECT * FROM price_history WHERE ticker = ? ORDER BY date DESC LIMIT ?',
  ).bind(ticker.toUpperCase(), limit).all<DbPrice>();
  return r.results;
}

export async function getLatestPrice(db: D1Database, ticker: string): Promise<DbPrice | null> {
  return db.prepare(
    'SELECT * FROM price_history WHERE ticker = ? ORDER BY date DESC LIMIT 1',
  ).bind(ticker.toUpperCase()).first<DbPrice>();
}

export async function getPriceCoverage(db: D1Database): Promise<Array<{
  ticker: string; row_count: number; start_date: string; end_date: string;
}>> {
  const r = await db.prepare('SELECT * FROM price_coverage ORDER BY row_count DESC').all<{
    ticker: string; row_count: number; start_date: string; end_date: string;
  }>();
  return r.results;
}

export async function validatePrices(db: D1Database): Promise<{
  ok: boolean; issues: string[];
}> {
  const issues: string[] = [];

  const dupes = await db.prepare(
    'SELECT ticker, date, COUNT(*) as cnt FROM price_history GROUP BY ticker, date HAVING cnt > 1 LIMIT 10',
  ).all<{ ticker: string; date: string; cnt: number }>();
  if (dupes.results.length > 0) issues.push(`${dupes.results.length} duplicate rows found`);

  const invalid = await db.prepare(
    'SELECT ticker, date, close_price FROM price_history WHERE close_price <= 0 OR close_price IS NULL LIMIT 10',
  ).all<{ ticker: string; date: string }>();
  if (invalid.results.length > 0) issues.push(`${invalid.results.length} rows with invalid close_price`);

  const future = await db.prepare(
    "SELECT ticker, date FROM price_history WHERE date > date('now') LIMIT 10",
  ).all<{ ticker: string; date: string }>();
  if (future.results.length > 0) issues.push(`${future.results.length} rows with future dates`);

  const zeroVol = await db.prepare(
    'SELECT COUNT(*) as cnt FROM price_history WHERE volume = 0 OR volume IS NULL',
  ).first<{ cnt: number }>();
  if (zeroVol && zeroVol.cnt > 0) issues.push(`${zeroVol.cnt} rows with zero or null volume`);

  return { ok: issues.length === 0, issues };
}
