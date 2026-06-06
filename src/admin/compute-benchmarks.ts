import { Env, ValuationBenchmarkRow } from '../types';
import { getCompany, getFinancials, listTickers } from '../db';
import { safeDivide } from '../engines/scoring';

// Use listTickers as alias
const getAllTickers = listTickers;

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function p25(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.25)]!;
}

function p75(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)]!;
}

export async function handleComputeBenchmarks(env: Env): Promise<Response> {
  try {
    const tickers = await env.DB.prepare('SELECT ticker FROM companies')
      .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

    // Collect PE/PS per sector
    const bySector = new Map<string, { pes: number[]; pss: number[] }>();
    const allPEs: number[] = [];
    const allPSs: number[] = [];

    for (const ticker of tickers) {
      const financials = await getFinancials(env.DB, ticker);
      const latest = financials[0]; // descending from DB
      if (!latest || !latest.revenue || !latest.net_income) continue;

      const company = await getCompany(env.DB, ticker);
      if (!company || !company.market_cap || company.market_cap <= 0) continue;

      const pe = safeDivide(company.market_cap, latest.net_income);
      const ps = safeDivide(company.market_cap, latest.revenue);

      if (pe <= 0 || ps <= 0) continue;
      if (pe > 1000 || ps > 100) continue; // filter extreme outliers

      allPEs.push(pe);
      allPSs.push(ps);

      const sector = company.sector || 'Unknown';
      if (!bySector.has(sector)) bySector.set(sector, { pes: [], pss: [] });
      bySector.get(sector)!.pes.push(pe);
      bySector.get(sector)!.pss.push(ps);
    }

    // Store market benchmark
    const marketRow: ValuationBenchmarkRow = {
      sector: 'ALL',
      benchmark_type: 'market',
      pe_median: median(allPEs),
      pe_p25: p25(allPEs),
      pe_p75: p75(allPEs),
      ps_median: median(allPSs),
      ps_p25: p25(allPSs),
      ps_p75: p75(allPSs),
      updated_at: '',
    };

    await env.DB.prepare(`
      INSERT INTO valuation_benchmarks (sector, benchmark_type, pe_median, pe_p25, pe_p75, ps_median, ps_p25, ps_p75, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(sector, benchmark_type) DO UPDATE SET
        pe_median = excluded.pe_median, pe_p25 = excluded.pe_p25, pe_p75 = excluded.pe_p75,
        ps_median = excluded.ps_median, ps_p25 = excluded.ps_p25, ps_p75 = excluded.ps_p75,
        updated_at = excluded.updated_at
    `).bind(
      marketRow.sector, marketRow.benchmark_type,
      marketRow.pe_median, marketRow.pe_p25, marketRow.pe_p75,
      marketRow.ps_median, marketRow.ps_p25, marketRow.ps_p75,
    ).run();

    // Store sector benchmarks
    const sectors: string[] = [];
    for (const [sector, data] of bySector) {
      sectors.push(sector);
      const row: ValuationBenchmarkRow = {
        sector,
        benchmark_type: 'sector',
        pe_median: median(data.pes),
        pe_p25: p25(data.pes),
        pe_p75: p75(data.pes),
        ps_median: median(data.pss),
        ps_p25: p25(data.pss),
        ps_p75: p75(data.pss),
        updated_at: '',
      };

      await env.DB.prepare(`
        INSERT INTO valuation_benchmarks (sector, benchmark_type, pe_median, pe_p25, pe_p75, ps_median, ps_p25, ps_p75, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(sector, benchmark_type) DO UPDATE SET
          pe_median = excluded.pe_median, pe_p25 = excluded.pe_p25, pe_p75 = excluded.pe_p75,
          ps_median = excluded.ps_median, ps_p25 = excluded.ps_p25, ps_p75 = excluded.ps_p75,
          updated_at = excluded.updated_at
      `).bind(
        row.sector, row.benchmark_type,
        row.pe_median, row.pe_p25, row.pe_p75,
        row.ps_median, row.ps_p25, row.ps_p75,
      ).run();
    }

    return Response.json({
      ok: true,
      totalTickers: tickers.length,
      sectorCount: sectors.length,
      market: { peMedian: marketRow.pe_median, psMedian: marketRow.ps_median, count: allPEs.length },
      sectorDetails: sectors.map(s => ({ sector: s, count: bySector.get(s)!.pes.length })),
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
