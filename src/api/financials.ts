import { getCachedResponse } from '../cache';
import { getFinancials } from '../db';
import { Env, FinancialsResponse, FinancialItem, ErrorResponse } from '../types';

export async function handleFinancials(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();

  return getCachedResponse(request, env.KV, upper, 'financials', async () => {
    const rows = await getFinancials(env.DB, upper);
    if (rows.length === 0) {
      const body: ErrorResponse = { error: `No financial data for ${upper}`, status: 404 };
      return Response.json(body, { status: 404 });
    }

    const items: FinancialItem[] = rows.map((r) => ({
      fiscalYear: r.fiscal_year,
      revenue: r.revenue,
      grossProfit: r.gross_profit,
      operatingIncome: r.operating_income,
      netIncome: r.net_income,
      operatingCashFlow: r.operating_cash_flow,
      freeCashFlow: r.free_cash_flow,
      totalAssets: r.total_assets,
      totalLiabilities: r.total_liabilities,
      shareholderEquity: r.shareholder_equity,
      sharesOutstanding: r.shares_outstanding,
    }));

    const body: FinancialsResponse = { ticker: upper, financials: items };
    return Response.json(body);
  });
}
