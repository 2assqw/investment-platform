import { getMetrics, getCompany, getFactorScores } from '../db';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';
import { ThesisResult, ThesisContext, ResearchSummary, ThesesByCategory } from './thesis-types';
import { THESIS_RULES, getDefaultThesis } from './thesis-rules';

async function buildContext(db: D1Database, ticker: string): Promise<ThesisContext | null> {
  const [metrics, company, factorRows] = await Promise.all([
    getMetrics(db, ticker),
    getCompany(db, ticker),
    getFactorScores(db, ticker),
  ]);
  if (!metrics) return null;

  const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');
  const factors: Record<string, number> = {};
  for (const row of factorRows) factors[row.factor_name] = row.score;

  const bd = await db.prepare(
    'SELECT metric_value FROM metric_breakdowns WHERE ticker = ? AND engine = ? AND metric_name = ?'
  ).bind(ticker, 'quality', 'fcfMargin').first<{ metric_value: number }>();

  const v = await runValidation(db, ticker, support.level, []);

  return {
    ticker,
    quality: metrics.quality_score,
    growth: metrics.growth_score,
    valuation: metrics.valuation_score,
    risk: metrics.risk_score,
    overall: metrics.overall_score,
    growthConsistency: factors['growth_consistency'] ?? 0,
    shareholderAlignment: factors['shareholder_alignment'] ?? 0,
    cashConversion: factors['cash_conversion'] ?? 0,
    fcfMargin: bd?.metric_value ?? 0,
    industrySupport: support.level,
    sector: company?.sector ?? '',
    industry: company?.industry ?? '',
    warningCount: v.allWarnings.length,
  };
}

export async function generateThesis(db: D1Database, ticker: string): Promise<ThesisResult | null> {
  const ctx = await buildContext(db, ticker);
  if (!ctx) return null;

  const matches = THESIS_RULES
    .filter(r => r.check(ctx))
    .sort((a, b) => a.priority - b.priority);

  const primary = matches[0]?.name ?? null;
  const secondary = matches.slice(1).map(r => r.name);

  const defaultThesis = primary ?? getDefaultThesis(ctx);

  const strengths: string[] = [];
  if (ctx.quality >= 80) strengths.push('Excellent quality business');
  if (ctx.growth >= 60) strengths.push('Strong growth profile');
  if (ctx.valuation >= 60) strengths.push('Attractive valuation');
  if (ctx.risk >= 80) strengths.push('Low financial risk');
  if (ctx.cashConversion >= 80) strengths.push('Superior cash generation');
  if (ctx.shareholderAlignment >= 80) strengths.push('Management aligned with shareholders');
  if (ctx.growthConsistency >= 70) strengths.push('Consistent track record');

  const risks: string[] = [];
  if (ctx.valuation < 30) risks.push('Expensive valuation');
  if (ctx.risk < 40) risks.push('Elevated financial risk');
  if (ctx.warningCount >= 2) risks.push('Data quality concerns');
  if (ctx.industrySupport === 'WARNING') risks.push('Industry model may be limited');
  if (ctx.industrySupport === 'FAIL') risks.push('Industry not supported by current model');

  const confidence = Math.min(100, Math.round(
    (ctx.quality + ctx.risk) / 2 - ctx.warningCount * 5 + (primary ? 20 : 0)
  ));

  return {
    ticker,
    primaryThesis: defaultThesis,
    secondaryTheses: secondary,
    confidence: Math.max(0, confidence),
    strengths,
    risks,
  };
}

export async function generateResearchSummary(db: D1Database, ticker: string): Promise<ResearchSummary | null> {
  const thesis = await generateThesis(db, ticker);
  if (!thesis) return null;

  const ctx = await buildContext(db, ticker);
  if (!ctx) return null;

  const grade = (v: number) => v >= 80 ? 'Excellent' : v >= 60 ? 'Good' : v >= 40 ? 'Fair' : 'Weak';

  return {
    ticker,
    overall: ctx.overall,
    thesis: thesis.primaryThesis,
    summary: {
      quality: grade(ctx.quality),
      growth: grade(ctx.growth),
      valuation: ctx.valuation >= 60 ? 'Attractive' : ctx.valuation >= 30 ? 'Fair' : 'Expensive',
      risk: grade(ctx.risk),
    },
    strengths: thesis.strengths,
    weaknesses: thesis.risks,
    trend: null,
  };
}

export async function generateThesesByCategory(db: D1Database): Promise<ThesesByCategory> {
  const tickers = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0 LIMIT 30')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const result: ThesesByCategory = {
    compounders: [], eliteGrowth: [], cashMachines: [],
    shareholderFriendly: [], deepValue: [],
  };

  for (const ticker of tickers) {
    const t = await generateThesis(db, ticker);
    if (!t) continue;
    if (t.primaryThesis === 'High Quality Compounder') result.compounders.push({ ticker, confidence: t.confidence });
    if (t.primaryThesis === 'Elite Growth Company') result.eliteGrowth.push({ ticker, confidence: t.confidence });
    if (t.secondaryTheses.includes('Cash Flow Machine') || t.primaryThesis === 'Cash Flow Machine') result.cashMachines.push({ ticker, confidence: t.confidence });
    if (t.secondaryTheses.includes('Shareholder Friendly') || t.primaryThesis === 'Shareholder Friendly') result.shareholderFriendly.push({ ticker, confidence: t.confidence });
    if (t.primaryThesis === 'Deep Value Candidate') result.deepValue.push({ ticker, confidence: t.confidence });
  }

  return result;
}
