import { FinancialRow } from '../src/types';

export function makeFinancialRow(overrides: Partial<FinancialRow> = {}): FinancialRow {
  const fy = overrides.fiscal_year ?? 2025;
  return {
    ticker: 'TEST',
    fiscal_year: fy,
    period_end_date: `${fy}-12-31`,
    revenue: 100_000,
    gross_profit: 60_000,
    operating_income: 30_000,
    net_income: 25_000,
    operating_cash_flow: 35_000,
    free_cash_flow: 20_000,
    total_assets: 200_000,
    total_liabilities: 80_000,
    shareholder_equity: 100_000,
    shares_outstanding: 10_000,
    ...overrides,
  };
}

export function multiYearData(years: number, base?: Partial<FinancialRow>): FinancialRow[] {
  const rows: FinancialRow[] = [];
  for (let i = 0; i < years; i++) {
    const growth = 1 + 0.15 * (years - 1 - i); // 15% YoY growth going backwards
    rows.push(makeFinancialRow({
      ...base,
      fiscal_year: 2025 - i,
      revenue: (base?.revenue ?? 100_000) * growth,
      net_income: (base?.net_income ?? 25_000) * growth,
      free_cash_flow: (base?.free_cash_flow ?? 20_000) * growth,
    }));
  }
  return rows;
}
