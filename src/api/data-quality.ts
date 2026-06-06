import { getFinancials } from '../db';
import { Env } from '../types';
import { validateFinancials } from '../validation';
import { defaultNormalizer } from '../normalizers';

export async function handleDataQuality(
  _request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();

  try {
    const financials = await getFinancials(env.DB, upper);
    if (financials.length === 0) {
      return Response.json({ ticker: upper, error: 'No financial data found' }, { status: 404 });
    }

    const validation = validateFinancials(financials);

    return Response.json({
      ticker: upper,
      totalYears: financials.length,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      financialYears: validation.details,
    });
  } catch (err) {
    return Response.json(
      { ticker: upper, error: String(err) },
      { status: 500 },
    );
  }
}
