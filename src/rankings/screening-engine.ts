import { getMetrics, getCompany, getFactorScores } from '../db';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';
import { RankingEntry, ScreenParams } from './ranking-types';

export async function screenTickers(
  db: D1Database,
  params: ScreenParams,
): Promise<{ count: number; results: RankingEntry[] }> {
  const tickers = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const results: RankingEntry[] = [];

  for (const ticker of tickers) {
    try {
      const [metrics, company, factorRows] = await Promise.all([
        getMetrics(db, ticker),
        getCompany(db, ticker),
        getFactorScores(db, ticker),
      ]);
      if (!metrics) continue;

      const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');
      if (!params.includeUnsupported && support.level === 'FAIL') continue;

      // Apply filters
      if (params.sector && company?.sector?.toLowerCase() !== params.sector.toLowerCase()) continue;
      if (params.industry && company?.industry?.toLowerCase() !== params.industry.toLowerCase()) continue;
      if (params.overallMin && metrics.overall_score < params.overallMin) continue;
      if (params.qualityMin && metrics.quality_score < params.qualityMin) continue;
      if (params.growthMin && metrics.growth_score < params.growthMin) continue;
      if (params.valuationMin && metrics.valuation_score < params.valuationMin) continue;
      if (params.riskMin && metrics.risk_score < params.riskMin) continue;

      const factors: Record<string, number> = {};
      for (const row of factorRows) {
        factors[row.factor_name] = row.score;
      }

      if (params.growthConsistencyMin && (factors.growth_consistency ?? 0) < params.growthConsistencyMin) continue;
      if (params.shareholderAlignmentMin && (factors.shareholder_alignment ?? 0) < params.shareholderAlignmentMin) continue;
      if (params.cashConversionMin && (factors.cash_conversion ?? 0) < params.cashConversionMin) continue;

      const v = await runValidation(db, ticker, support.level, []);
      const warningCount = v.allWarnings.length;
      const trust = Math.max(0, 100 - warningCount * 10);

      if (params.trustMin && trust < params.trustMin) continue;

      results.push({
        rank: 0,
        ticker,
        company: company?.name ?? ticker,
        sector: company?.sector ?? '',
        industry: company?.industry ?? '',
        overall: metrics.overall_score,
        quality: metrics.quality_score,
        growth: metrics.growth_score,
        valuation: metrics.valuation_score,
        risk: metrics.risk_score,
        growthConsistency: factors.growth_consistency ?? 0,
        shareholderAlignment: factors.shareholder_alignment ?? 0,
        cashConversion: factors.cash_conversion ?? 0,
        trust,
        warningCount,
        industrySupport: support.level,
      });

    } catch {
      // skip
    }
  }

  results.sort((a, b) => b.overall - a.overall);
  const limit = params.limit ?? 50;
  const sliced = results.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));

  return { count: sliced.length, results: sliced };
}
