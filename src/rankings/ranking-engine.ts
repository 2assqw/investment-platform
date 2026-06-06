import { getMetrics, getCompany, getFactorScores } from '../db';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';
import { RankingEntry, RankingResponse } from './ranking-types';

export async function generateRankings(
  db: D1Database,
  sortBy: string,
  limit: number = 50,
  includeUnsupported: boolean = false,
): Promise<RankingResponse> {
  const tickers = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const entries: RankingEntry[] = [];

  for (const ticker of tickers) {
    try {
      const [metrics, company, factorRows] = await Promise.all([
        getMetrics(db, ticker),
        getCompany(db, ticker),
        getFactorScores(db, ticker),
      ]);
      if (!metrics) continue;

      const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');
      if (!includeUnsupported && support.level === 'FAIL') continue;

      const factors: Record<string, number> = {};
      for (const row of factorRows) {
        factors[row.factor_name] = row.score;
      }

      const v = await runValidation(db, ticker, support.level, []);
      const warningCount = v.allWarnings.length;

      entries.push({
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
        trust: Math.max(0, 100 - warningCount * 10),
        warningCount,
        industrySupport: support.level,
      });
    } catch {
      // skip broken tickers
    }
  }

  // Sort
  const getVal = (e: RankingEntry, key: string): number => {
    const map: Record<string, number> = {
      overall: e.overall, quality: e.quality, growth: e.growth,
      valuation: e.valuation, risk: e.risk,
      shareholderAlignment: e.shareholderAlignment,
      growthConsistency: e.growthConsistency,
      cashConversion: e.cashConversion,
    };
    return map[key] ?? 0;
  };
  entries.sort((a, b) => getVal(b, sortBy) - getVal(a, sortBy));

  // Assign ranks
  const results = entries.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    count: results.length,
    results,
  };
}
