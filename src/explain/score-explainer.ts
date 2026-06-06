import { getMetrics, getMetricDetails, getCompany, getFactorScores } from '../db';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';
import { Env } from '../types';
import { Explanation, Contribution, FactorAttribution, TrustInfo } from './types';
import { computeContributions } from './contribution-engine';
import { computeFactorAttribution } from './factor-attribution';

function isTruthy<T>(x: T | null | undefined): x is T { return x !== null && x !== undefined; }

function getQ(qm: Record<string, { value: number; score: number }>, key: string): number {
  return qm[key]?.value ?? 0;
}

function getF(f: Record<string, { score: number }>, key: string): number {
  return f[key]?.score ?? 50;
}

function detectStrengths(
  scores: { quality: number; growth: number; valuation: number; risk: number },
  qualityMetrics: Record<string, { value: number; score: number }>,
  factors: Record<string, { score: number }>,
): string[] {
  const s: string[] = [];

  if (getQ(qualityMetrics, 'roe') > 20) s.push('strong_capital_efficiency');
  if (getQ(qualityMetrics, 'fcfMargin') > 20) s.push('high_cash_generation');
  if (getQ(qualityMetrics, 'debtRatio') < 40) s.push('low_leverage');
  if (scores.growth > 60) s.push('industry_leading_growth');
  if (scores.risk > 80) s.push('strong_balance_sheet');
  if (scores.valuation > 60) s.push('attractive_valuation');
  if (getF(factors, 'cash_conversion') >= 80) s.push('high_earnings_quality');
  if (getF(factors, 'shareholder_alignment') >= 80) s.push('shareholder_friendly');
  if (getF(factors, 'growth_consistency') >= 70) s.push('stable_growth');

  return s;
}

function detectWeaknesses(
  scores: { quality: number; growth: number; valuation: number; risk: number },
  qualityMetrics: Record<string, { value: number; score: number }>,
  industrySupport: { level: string },
  factors: Record<string, { score: number }>,
  warnings: string[],
): string[] {
  const w: string[] = [];

  if (scores.valuation < 30) w.push('expensive_valuation');
  if (scores.quality < 40) w.push('low_quality_score');
  if (scores.growth < 20) w.push('slow_growth');
  if (scores.risk < 40) w.push('elevated_risk');
  if (getQ(qualityMetrics, 'roe') < 5) w.push('low_capital_efficiency');
  if (getQ(qualityMetrics, 'fcfMargin') < 5) w.push('weak_cash_generation');
  if (getF(factors, 'growth_consistency') < 40) w.push('volatile_growth');
  if (getF(factors, 'shareholder_alignment') < 30) w.push('shareholder_dilution');
  if (getF(factors, 'cash_conversion') < 40) w.push('poor_earnings_quality');
  if (industrySupport.level === 'WARNING') w.push('industry_model_limited');
  if (industrySupport.level === 'FAIL') w.push('industry_not_supported');
  if (warnings.some(x => x.includes('stock_split'))) w.push('share_count_distortion');

  return w;
}

function computeTrust(
  industrySupport: { level: string },
  warnings: string[],
  scores: { quality: number; growth: number; risk: number },
  fiscalYears: number,
): TrustInfo {
  let score = 100;

  if (industrySupport.level === 'FAIL') score -= 30;
  else if (industrySupport.level === 'WARNING') score -= 15;

  if (warnings.some(x => x.includes('stock_split'))) score -= 10;
  if (warnings.some(x => x.includes('validation_failed'))) score -= 20;
  if (fiscalYears < 4) score -= 15;
  if (scores.quality === 0 || scores.growth === 0 || scores.risk === 0) score -= 25;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    level: score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
  };
}

export async function generateExplanation(env: Env, ticker: string): Promise<Explanation | null> {
  const upper = ticker.toUpperCase();

  const [metrics, breakdownRows, company, factorRows] = await Promise.all([
    getMetrics(env.DB, upper),
    getMetricDetails(env.DB, upper),
    getCompany(env.DB, upper),
    getFactorScores(env.DB, upper),
  ]);

  if (!metrics) return null;

  const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');

  const qualityMetrics: Record<string, { value: number; score: number }> = {};
  for (const row of breakdownRows) {
    if (row.engine === 'quality') {
      qualityMetrics[row.metric_name] = { value: row.metric_value, score: row.metric_score };
    }
  }

  const factors: Record<string, { score: number }> = {};
  for (const row of factorRows) {
    factors[row.factor_name] = { score: row.score };
  }

  const scores = {
    quality: metrics.quality_score,
    growth: metrics.growth_score,
    valuation: metrics.valuation_score,
    risk: metrics.risk_score,
  };

  const contributions = computeContributions(scores);
  const factorAttribution = computeFactorAttribution(factors);

  const { allWarnings } = await runValidation(env.DB, upper, support.level, []);
  const warnings = allWarnings;

  const strengths = detectStrengths(scores, qualityMetrics, factors);
  const weaknesses = detectWeaknesses(scores, qualityMetrics, support, factors, warnings);
  const trust = computeTrust(support, warnings, scores, metrics.quality_score > 0 ? 5 : 0);

  return {
    ticker: upper,
    overall: metrics.overall_score,
    industrySupport: { level: support.level, reason: support.reason },
    warnings,
    contributions,
    factorContributions: factorAttribution,
    strengths,
    weaknesses,
    trust,
  };
}
