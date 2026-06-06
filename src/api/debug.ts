import { getCompany, getFinancials, getFactorScores } from '../db';
import { Env, FinancialRow } from '../types';
import { getIndustrySupport } from '../classification';
import { qualityEngine, growthEngine, riskEngine } from '../engines';
import { EngineInput } from '../engines/types';
import { defaultNormalizer } from '../normalizers';
import { safeDivide, cagr, roundToDecimal } from '../engines/scoring';
import { runValidation } from '../validation';

// ============================================================
// Types
// ============================================================

interface DebugResponse {
  ticker: string;
  company: { name: string; sector: string; industry: string } | null;
  industrySupport: { level: string; reason: string | null };
  errors: string[];
  warnings: string[];
  financials: { latest: FinancialRow | null; history: FinancialRow[] };
  growth: DebugEngine;
  quality: DebugEngine;
  risk: DebugEngine;
  overall: { score: number; formula: Record<string, number> };
  metadata: { engineVersion: string; updatedAt: string; source: string };
  splitDetection: { detected: boolean; warnings: Array<{ fiscalYear: number; ratio: number }> };
  factors: Record<string, { score: number; metrics: Record<string, number> }>;
}

interface DebugMetric {
  value: number;
  score: number;
  extra?: Record<string, number>;
}

interface DebugEngine {
  score: number;
  available: boolean;
  inputs?: Record<string, unknown>;
  metrics: Record<string, DebugMetric>;
}

// ============================================================
// Engine re-run helpers
// ============================================================

function buildQualityDebug(input: EngineInput, breakdown: Record<string, unknown>): DebugEngine {
  const metrics: Record<string, DebugMetric> = {};
  for (const [key, val] of Object.entries(breakdown)) {
    if (key.startsWith('_')) continue; // skip meta fields like _fiscalYearUsed
    if (val && typeof val === 'object' && 'value' in val && 'score' in val) {
      const v = val as { value: number; score: number; debug?: Record<string, unknown> };
      const extra: Record<string, number> = {};
      if (v.debug) {
        for (const [dk, dv] of Object.entries(v.debug)) {
          if (typeof dv === 'number') extra[dk] = dv;
        }
        // also store guard info
        if (v.debug.guardTriggered) {
          extra._guard = (v.debug.guardTriggered as string).charCodeAt(0); // encode as number
        }
      }
      metrics[key] = { value: roundToDecimal(v.value, 1), score: v.score, extra: Object.keys(extra).length > 0 ? extra : undefined };
    }
  }
  return { score: 0, available: true, metrics };
}

function buildGrowthDebug(input: EngineInput, breakdown: Record<string, unknown>): DebugEngine {
  const sorted = [...input.financials].sort((a, b) => b.fiscal_year - a.fiscal_year);
  if (sorted.length < 4) {
    return { score: 0, available: false, metrics: {} };
  }

  const latest = sorted[0]!;
  const base = sorted[3]!;

  const epsLatest = safeDivide(latest.net_income, latest.shares_outstanding);
  const epsBase = safeDivide(base.net_income, base.shares_outstanding);

  const metrics: Record<string, DebugMetric> = {
    revenueCagr: {
      value: roundToDecimal(cagr(base.revenue, latest.revenue, 3) * 100, 1),
      score: 0,
      extra: { latest: latest.revenue, base: base.revenue },
    },
    fcfCagr: {
      value: roundToDecimal(cagr(base.free_cash_flow, latest.free_cash_flow, 3) * 100, 1),
      score: 0,
      extra: { latest: latest.free_cash_flow, base: base.free_cash_flow },
    },
    epsCagr: {
      value: roundToDecimal(cagr(epsBase, epsLatest, 3) * 100, 1),
      score: 0,
      extra: {
        latest: roundToDecimal(epsLatest, 4),
        base: roundToDecimal(epsBase, 4),
        latestShares: latest.shares_outstanding,
        baseShares: base.shares_outstanding,
      },
    },
  };

  return {
    score: 0,
    available: true,
    inputs: {
      latestYear: latest.fiscal_year,
      baseYear: base.fiscal_year,
    },
    metrics,
  };
}

function buildRiskDebug(input: EngineInput, breakdown: Record<string, unknown>): DebugEngine {
  const metrics: Record<string, DebugMetric> = {};
  for (const [key, val] of Object.entries(breakdown)) {
    if (val && typeof val === 'object') {
      const v = val as { value: number | null; score: number; available: boolean; model?: string; reason?: string };
      metrics[key] = {
        value: typeof v.value === 'number' ? roundToDecimal(v.value, 2) : 0,
        score: v.score,
        extra: {
          available: v.available ? 1 : 0,
          ...(v.model ? { model: v.model as unknown as number } : {}),
        },
      };
    }
  }
  return { score: 0, available: true, metrics };
}

// ============================================================
// Main handler
// ============================================================

export async function handleDebug(
  _request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();
  const errors: string[] = [];

  // 1. Read company info
  let company: { name: string; sector: string; industry: string } | null = null;
  try {
    const c = await getCompany(env.DB, upper);
    if (c) company = { name: c.name, sector: c.sector, industry: c.industry };
  } catch (e) {
    errors.push(`company_lookup_failed: ${String(e)}`);
  }

  const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');

  // 2. Read financials
  let financials: FinancialRow[] = [];
  try {
    financials = await getFinancials(env.DB, upper);
  } catch (e) {
    errors.push(`financials_lookup_failed: ${String(e)}`);
  }
  const latest = financials.length > 0 ? financials[financials.length - 1]! : null;

  // 3. Run normalizer
  let normalized = defaultNormalizer.normalize(financials);
  const splitDetection = {
    detected: normalized.warnings.length > 0,
    warnings: normalized.warnings,
  };

  // 4. Run engines on-the-fly
  const engineInput: EngineInput = {
    ticker: upper,
    financials: normalized.financials,
    warnings: normalized.warnings,
  };

  let qualityResult = { score: 0, breakdown: {} as Record<string, unknown> };
  let growthResult = { score: 0, breakdown: {} as Record<string, unknown> };
  let riskResult = { score: 0, breakdown: {} as Record<string, unknown> };

  try { qualityResult = qualityEngine.calculate(engineInput); } catch (e) { errors.push(`quality_engine_failed: ${String(e)}`); }
  try { growthResult = growthEngine.calculate(engineInput); } catch (e) { errors.push(`growth_engine_failed: ${String(e)}`); }
  try { riskResult = riskEngine.calculate(engineInput); } catch (e) { errors.push(`risk_engine_failed: ${String(e)}`); }

  const overallScore = Math.round(
    qualityResult.score * 0.30 + growthResult.score * 0.30 + riskResult.score * 0.20,
  ) / 0.8;

  // 5. Run validation
  let allWarnings: string[] = [];
  try {
    const v = await runValidation(env.DB, upper, support.level, []);
    allWarnings = v.allWarnings;
  } catch (e) {
    errors.push(`validation_failed: ${String(e)}`);
  }

  // 5b. Load factor scores
  const factorRows = await getFactorScores(env.DB, upper);
  const factors: Record<string, { score: number; metrics: Record<string, number> }> = {};
  for (const row of factorRows) {
    try {
      factors[row.factor_name] = { score: row.score, metrics: JSON.parse(row.metrics_json) };
    } catch { /* skip broken JSON */ }
  }

  // 6. Build response
  const qualityDebug = buildQualityDebug(engineInput, qualityResult.breakdown);
  qualityDebug.score = qualityResult.score;

  const growthDebug = buildGrowthDebug(engineInput, growthResult.breakdown);
  growthDebug.score = growthResult.score;

  const riskDebug = buildRiskDebug(engineInput, riskResult.breakdown);
  riskDebug.score = riskResult.score;

  const body: DebugResponse = {
    ticker: upper,
    company,
    industrySupport: { level: support.level, reason: support.reason },
    errors,
    warnings: allWarnings,
    financials: {
      latest,
      history: financials,
    },
    growth: growthDebug,
    quality: qualityDebug,
    risk: riskDebug,
    overall: {
      score: Math.round(overallScore),
      formula: { qualityWeight: 0.3, growthWeight: 0.3, valuationWeight: 0, riskWeight: 0.2 },
    },
    metadata: {
      engineVersion: '1.0.0',
      updatedAt: new Date().toISOString(),
      source: 'SEC',
    },
    splitDetection,
    factors,
  };

  return Response.json(body);
}
