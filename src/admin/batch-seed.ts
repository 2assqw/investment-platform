import { Env } from '../types';
import { seedTicker } from './seed';

export async function handleBatchSeed(env: Env, url: URL): Promise<Response> {
  const startParam = url.searchParams.get('start') ?? '0';
  const limitParam = url.searchParams.get('limit') ?? '10';
  const start = parseInt(startParam, 10);
  const limit = Math.min(parseInt(limitParam, 10), 10);

  // Use the SEC company tickers list
  let tickers: string[] = [];
  try {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'investment-platform/1.0 contact@example.com' },
    });
    const data = await res.json() as Record<string, { ticker: string }>;
    tickers = Object.values(data).map(v => v.ticker.toUpperCase());
  } catch {
    tickers = ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'JPM', 'BAC', 'XOM', 'FCX'];
  }

  const batch = tickers.slice(start, start + limit);
  const results: Array<{ ticker: string; ok: boolean; error?: string; years?: number }> = [];

  for (const ticker of batch) {
    try {
      const res = await seedTicker(env, ticker, true);
      const data = await res.json() as Record<string, unknown>;
      results.push({ ticker, ok: data.ok as boolean, years: data.fiscalYears as number, error: data.ok ? undefined : data.error as string });
    } catch (e) {
      results.push({ ticker, ok: false, error: String(e) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  return Response.json({
    batch: `${start}-${start + limit - 1}`,
    total: tickers.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}

export async function handleCoverageReport(env: Env): Promise<Response> {
  const metrics = await env.DB.prepare('SELECT COUNT(*) as count FROM metrics WHERE overall_score > 0')
    .first<{ count: number }>();
  const companies = await env.DB.prepare('SELECT COUNT(*) as count FROM companies')
    .first<{ count: number }>();
  const sectors = await env.DB.prepare('SELECT DISTINCT sector FROM companies WHERE sector IS NOT NULL')
    .all<{ sector: string }>();

  const supportedIndustries = ['Technology', 'Communication Services', 'Consumer Cyclical', 'Consumer Defensive', 'Healthcare'];
  const unsupportedIndustries = ['Financial Services', 'Real Estate', 'Insurance', 'Energy', 'Basic Materials', 'Industrials', 'Utilities'];

  const sectorCounts: Record<string, number> = {};
  for (const row of sectors.results) {
    const s = row.sector || 'Unknown';
    sectorCounts[s] = (sectorCounts[s] ?? 0) + 1;
  }

  const companyCount = companies?.count ?? 0;
  const scoredCount = metrics?.count ?? 0;
  return Response.json({
    companies: companyCount,
    scored: scoredCount,
    coverage: companyCount > 0 ? Math.round(scoredCount / companyCount * 1000) / 10 : 0,
    supportedIndustries: supportedIndustries.filter(s => (sectorCounts[s] ?? 0) > 0),
    unsupportedIndustries: unsupportedIndustries.filter(s => (sectorCounts[s] ?? 0) > 0),
    sectorBreakdown: sectorCounts,
  });
}
