import { CompanyRow } from '../../types';

export async function getCompany(
  db: D1Database,
  ticker: string,
): Promise<CompanyRow | null> {
  return db
    .prepare('SELECT * FROM companies WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<CompanyRow>();
}

export async function upsertCompany(
  db: D1Database,
  company: CompanyRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO companies (ticker, cik, name, sector, industry, market_cap, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(ticker) DO UPDATE SET
         cik = excluded.cik,
         name = excluded.name,
         sector = excluded.sector,
         industry = excluded.industry,
         market_cap = excluded.market_cap,
         updated_at = excluded.updated_at`,
    )
    .bind(company.ticker, company.cik, company.name, company.sector, company.industry, company.market_cap)
    .run();
}

export async function listCompanies(db: D1Database): Promise<CompanyRow[]> {
  const result = await db
    .prepare('SELECT * FROM companies')
    .all<CompanyRow>();
  return result.results;
}

export async function listTickers(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT ticker FROM companies')
    .all<{ ticker: string }>();
  return result.results.map((r) => r.ticker);
}

export async function getCompanySector(
  db: D1Database,
  ticker: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT sector FROM companies WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<{ sector: string }>();
  return row?.sector ?? null;
}
