import { getCachedResponse } from '../cache';
import { getMetrics, getCompany } from '../db';
import { CompanyResponse, Env, ErrorResponse } from '../types';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';

export async function handleCompany(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();

  // Get base data from cache (scores + industry support, no score warnings)
  const cached = await getCachedResponse(request, env.KV, upper, 'company', async () => {
    const [metrics, company] = await Promise.all([
      getMetrics(env.DB, upper),
      getCompany(env.DB, upper),
    ]);

    if (!metrics) {
      return Response.json({ error: `Ticker ${upper} not found`, status: 404 } as ErrorResponse, { status: 404 });
    }

    const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');

    const industryWarnings: string[] = [];
    if (support.level !== 'PASS' && support.reason) {
      industryWarnings.push(support.reason);
    }

    return Response.json({
      ticker: metrics.ticker,
      industrySupport: { level: support.level, reason: support.reason },
      warnings: industryWarnings,
      scores: {
        quality: metrics.quality_score,
        growth: metrics.growth_score,
        valuation: metrics.valuation_score,
        risk: metrics.risk_score,
        overall: metrics.overall_score,
      },
      updatedAt: metrics.updated_at,
    });
  });

  const data = (await cached.json()) as CompanyResponse;
  if ('error' in data) {
    return cached;
  }

  // Run score validation fresh on every request, merge with cached industry warnings
  const { allWarnings } = await runValidation(env.DB, upper, data.industrySupport.level, data.warnings);

  const body: CompanyResponse = { ...data, warnings: allWarnings };
  return Response.json(body);
}
