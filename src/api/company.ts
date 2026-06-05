import { getCachedResponse } from '../cache';
import { getMetrics } from '../db';
import { CompanyResponse, Env, ErrorResponse } from '../types';

export async function handleCompany(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();

  return getCachedResponse(request, env.KV, upper, 'company', async () => {
    const metrics = await getMetrics(env.DB, upper);
    if (!metrics) {
      const body: ErrorResponse = { error: `Ticker ${upper} not found`, status: 404 };
      return Response.json(body, { status: 404 });
    }

    const body: CompanyResponse = {
      ticker: metrics.ticker,
      scores: {
        quality: metrics.quality_score,
        growth: metrics.growth_score,
        valuation: metrics.valuation_score,
        risk: metrics.risk_score,
        overall: metrics.overall_score,
      },
      updatedAt: metrics.updated_at,
    };

    return Response.json(body);
  });
}
