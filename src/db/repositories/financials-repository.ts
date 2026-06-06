import { FinancialRow } from '../../types';

export async function getFinancials(
  db: D1Database,
  ticker: string,
  fiscalYear?: number,
): Promise<FinancialRow[]> {
  if (fiscalYear !== undefined) {
    const result = await db
      .prepare(
        'SELECT * FROM financials WHERE ticker = ? AND fiscal_year = ? ORDER BY fiscal_year DESC',
      )
      .bind(ticker.toUpperCase(), fiscalYear)
      .all<FinancialRow>();
    return result.results;
  }
  const result = await db
    .prepare(
      'SELECT * FROM financials WHERE ticker = ? ORDER BY fiscal_year DESC',
    )
    .bind(ticker.toUpperCase())
    .all<FinancialRow>();
  return result.results;
}

export async function getLatestFinancials(
  db: D1Database,
  ticker: string,
): Promise<FinancialRow | null> {
  return db
    .prepare(
      'SELECT * FROM financials WHERE ticker = ? ORDER BY fiscal_year DESC LIMIT 1',
    )
    .bind(ticker.toUpperCase())
    .first<FinancialRow>();
}

export async function upsertFinancials(
  db: D1Database,
  financials: FinancialRow[],
): Promise<void> {
  if (financials.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO financials (ticker, fiscal_year, period_end_date, revenue, gross_profit, operating_income, net_income, operating_cash_flow, free_cash_flow, total_assets, total_liabilities, shareholder_equity, shares_outstanding)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ticker, fiscal_year) DO UPDATE SET
       period_end_date = excluded.period_end_date,
       revenue = excluded.revenue,
       gross_profit = excluded.gross_profit,
       operating_income = excluded.operating_income,
       net_income = excluded.net_income,
       operating_cash_flow = excluded.operating_cash_flow,
       free_cash_flow = excluded.free_cash_flow,
       total_assets = excluded.total_assets,
       total_liabilities = excluded.total_liabilities,
       shareholder_equity = excluded.shareholder_equity,
       shares_outstanding = excluded.shares_outstanding`,
  );

  const batch = financials.map((f) =>
    stmt.bind(
      f.ticker,
      f.fiscal_year,
      f.period_end_date,
      f.revenue,
      f.gross_profit,
      f.operating_income,
      f.net_income,
      f.operating_cash_flow,
      f.free_cash_flow,
      f.total_assets,
      f.total_liabilities,
      f.shareholder_equity,
      f.shares_outstanding,
    ),
  );
  await db.batch(batch);
}
