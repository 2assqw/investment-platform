import { getMetrics, getCompany, getFactorScores } from '../db';
import { getIndustrySupport } from '../classification';
import { RankingEntry, DiscoverResponse } from './ranking-types';

export async function generateDiscovery(db: D1Database): Promise<DiscoverResponse> {
  const tickers = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const all: RankingEntry[] = [];

  for (const ticker of tickers) {
    try {
      const [metrics, company, factorRows] = await Promise.all([
        getMetrics(db, ticker),
        getCompany(db, ticker),
        getFactorScores(db, ticker),
      ]);
      if (!metrics) continue;

      const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');
      if (support.level === 'FAIL') continue;

      const factors: Record<string, number> = {};
      for (const row of factorRows) factors[row.factor_name] = row.score;

      all.push({
        rank: 0, ticker,
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
        trust: 80, warningCount: 0,
        industrySupport: support.level,
      });
    } catch { /* skip */ }
  }

  const top = (arr: RankingEntry[], key: keyof RankingEntry, min: number, n: number) =>
    arr.filter(e => (e[key] as number) >= min).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, n).map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    highQuality: top(all, 'quality', 80, 10),
    highGrowth: top(all, 'growth', 60, 10),
    highValue: top(all, 'valuation', 70, 10),
    shareholderFriendly: top(all, 'shareholderAlignment', 80, 10),
    cashMachines: top(all, 'cashConversion', 80, 10),
    consistentCompounders: top(all, 'growthConsistency', 80, 10),
  };
}
