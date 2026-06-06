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

  try {
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
        scores: sanitizeScores({
          quality: metrics.quality_score,
          growth: metrics.growth_score,
          valuation: metrics.valuation_score,
          risk: metrics.risk_score,
          overall: metrics.overall_score,
        }),
        updatedAt: metrics.updated_at,
      });
    });

    const data = (await cached.clone().json()) as Record<string, unknown>;
    if (typeof data.error === 'string') {
      return cached;
    }

    // Handle stale cache: old entries may lack industrySupport + warnings
    const industrySupport = (data.industrySupport as { level: string; reason: string | null } | undefined) ?? { level: 'WARNING', reason: null };
    const cachedWarnings: string[] = Array.isArray(data.warnings) ? (data.warnings as string[]) : [];
    const supportLevel = (industrySupport.level as string) === 'FAIL' ? 'FAIL' as const
      : (industrySupport.level as string) === 'WARNING' ? 'WARNING' as const
      : 'PASS' as const;

    // Run score validation in try/catch — must never crash the request
    let allWarnings: string[] = [...cachedWarnings];
    try {
      const result = await runValidation(env.DB, upper, supportLevel, cachedWarnings);
      allWarnings = result.allWarnings;
    } catch (err) {
      console.error(`[company] validation failed for ${upper}:`, err);
      allWarnings.push('validation_failed');
    }

    // Sanitize scores (guard against NaN/Infinity from bad data)
    const scores = data.scores as Record<string, number> | undefined;
    const sanitizedScores = sanitizeScores({
      quality: scores?.quality ?? 0,
      growth: scores?.growth ?? 0,
      valuation: scores?.valuation ?? 0,
      risk: scores?.risk ?? 0,
      overall: scores?.overall ?? 0,
    });

    const body: CompanyResponse = {
      ticker: (data.ticker as string) ?? upper,
      industrySupport: { level: supportLevel, reason: industrySupport.reason ?? null },
      warnings: allWarnings,
      scores: sanitizedScores,
      updatedAt: (data.updatedAt as string) ?? '',
    };
    return Response.json(body);
  } catch (err) {
    console.error(`[company] fatal error for ${upper}:`, err);
    return Response.json(
      { error: `Internal error for ${upper}`, status: 500 } as ErrorResponse,
      { status: 500 },
    );
  }
}

function sanitizeScores(scores: {
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  overall: number;
}): {
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  overall: number;
} {
  return {
    quality: Number.isFinite(scores.quality) ? scores.quality : 0,
    growth: Number.isFinite(scores.growth) ? scores.growth : 0,
    valuation: Number.isFinite(scores.valuation) ? scores.valuation : 0,
    risk: Number.isFinite(scores.risk) ? scores.risk : 0,
    overall: Number.isFinite(scores.overall) ? scores.overall : 0,
  };
}
