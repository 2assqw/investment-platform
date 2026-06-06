import { getMetrics, getMetricDetails } from '../db';
import { getIndustrySupport } from '../classification';
import { validateScores } from '../validation';
import { SupportLevel } from '../classification/types';
import { BENCHMARK_UNIVERSE, BenchmarkTicker } from './benchmark-tickers';

export interface TickerBenchmark {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  industrySupport: { level: string; reason: string | null };
  scores: {
    quality: number;
    growth: number;
    valuation: number;
    risk: number;
    overall: number;
  };
  status: 'PASS' | 'WARNING' | 'FAIL';
  statusReason: string;
  anomalies: string[];
  updatedAt: string;
}

function getSectorGroup(sector: string): string {
  const s = sector.toLowerCase();
  if (s === 'technology' || s === 'communication services') return 'technology';
  if (s === 'energy') return 'energy';
  if (s === 'basic materials') return 'materials';
  if (s === 'financial services') return 'financial';
  if (s === 'real estate') return 'reit';
  if (s === 'consumer defensive' || s === 'consumer cyclical') return 'consumer';
  if (s === 'healthcare') return 'healthcare';
  return 'other';
}

function validateScore(
  group: string,
  scores: { quality: number; growth: number; risk: number },
  supportLevel: SupportLevel,
): { status: 'PASS' | 'WARNING' | 'FAIL'; reason: string } {
  // FAIL industries — known incompatible
  if (supportLevel === 'FAIL') {
    return { status: 'FAIL', reason: 'industry_not_supported' };
  }

  // Technology rules
  if (group === 'technology') {
    if (scores.quality < 70 || scores.growth < 30 || scores.risk < 60) {
      if (scores.growth === 0 || scores.risk === 0) {
        return { status: 'FAIL', reason: 'critical_score_zero' };
      }
      return { status: 'WARNING', reason: 'score_below_expected' };
    }
    return { status: 'PASS', reason: 'all_checks_passed' };
  }

  // Energy rules: quality >= 20, risk >= 50, growth can be cyclical
  if (group === 'energy') {
    if (scores.quality < 20 || scores.risk < 50) {
      return { status: 'WARNING', reason: 'score_below_expected' };
    }
    return { status: 'PASS', reason: 'all_checks_passed' };
  }

  // Materials rules: growth can be volatile, don't fail on growth alone
  if (group === 'materials') {
    if (scores.quality < 20 || scores.risk < 40) {
      return { status: 'WARNING', reason: 'score_below_expected' };
    }
    return { status: 'PASS', reason: 'all_checks_passed' };
  }

  // Consumer rules: quality >= 50, risk >= 50
  if (group === 'consumer') {
    if (scores.quality < 50 || scores.risk < 50) {
      return { status: 'WARNING', reason: 'score_below_expected' };
    }
    return { status: 'PASS', reason: 'all_checks_passed' };
  }

  // Healthcare rules: quality >= 50, risk >= 50
  if (group === 'healthcare') {
    if (scores.quality < 50 || scores.risk < 50) {
      return { status: 'WARNING', reason: 'score_below_expected' };
    }
    return { status: 'PASS', reason: 'all_checks_passed' };
  }

  return { status: 'WARNING', reason: 'unknown_sector' };
}

export async function runBenchmark(db: D1Database): Promise<{
  tickers: TickerBenchmark[];
  summary: Record<string, { total: number; pass: number; warning: number; fail: number }>;
  industries: Record<string, { status: string; tickers: string[] }>;
  anomalies: Array<{ ticker: string; warning: string }>;
}> {
  const tickers: TickerBenchmark[] = [];
  const anomalies: Array<{ ticker: string; warning: string }> = [];
  const sectorSummary: Record<string, { total: number; pass: number; warning: number; fail: number }> = {};
  const industryReport: Record<string, { status: string; tickers: string[] }> = {};

  let totalPass = 0;
  let totalWarning = 0;
  let totalFail = 0;

  for (const bt of BENCHMARK_UNIVERSE) {
    try {
      const metrics = await getMetrics(db, bt.ticker);
      const breakdownRows = await getMetricDetails(db, bt.ticker);

      if (!metrics) {
        tickers.push({
          ticker: bt.ticker,
          name: bt.ticker,
          sector: bt.sector,
          industry: bt.industry,
          industrySupport: { level: 'WARNING', reason: 'no_data' },
          scores: { quality: 0, growth: 0, valuation: 0, risk: 0, overall: 0 },
          status: 'WARNING',
          statusReason: 'no_data_in_d1',
          anomalies: ['no_data'],
          updatedAt: '',
        });
        continue;
      }

      const support = getIndustrySupport(bt.sector, bt.industry);
      const scores = {
        quality: metrics.quality_score,
        growth: metrics.growth_score,
        valuation: metrics.valuation_score,
        risk: metrics.risk_score,
        overall: metrics.overall_score,
      };

      const group = getSectorGroup(bt.sector);
      const { status, reason } = validateScore(group, scores, support.level);

      // Run score validation for anomalies
      const scoreResult = await validateScores(db, bt.ticker, support.level);

      if (status === 'PASS') totalPass++;
      else if (status === 'WARNING') totalWarning++;
      else totalFail++;

      // Track sector summary
      if (!sectorSummary[group]) sectorSummary[group] = { total: 0, pass: 0, warning: 0, fail: 0 };
      sectorSummary[group]!.total++;
      if (status === 'PASS') sectorSummary[group]!.pass++;
      else if (status === 'WARNING') sectorSummary[group]!.warning++;
      else sectorSummary[group]!.fail++;

      // Track industry report
      const indKey = group;
      if (!industryReport[indKey]) industryReport[indKey] = { status: 'PASS', tickers: [] };
      industryReport[indKey]!.tickers.push(bt.ticker);
      if (status === 'FAIL') industryReport[indKey]!.status = 'FAIL';
      else if (status === 'WARNING' && industryReport[indKey]!.status !== 'FAIL') {
        industryReport[indKey]!.status = 'WARNING';
      }

      // Collect anomalies
      for (const a of scoreResult.anomalies) {
        anomalies.push({ ticker: bt.ticker, warning: `score_warning:${a.type}` });
      }

      const tickerAnomalies = scoreResult.anomalies.map(a => a.type);

      tickers.push({
        ticker: bt.ticker,
        name: bt.ticker,
        sector: bt.sector,
        industry: bt.industry,
        industrySupport: { level: support.level, reason: support.reason },
        scores,
        status,
        statusReason: reason,
        anomalies: tickerAnomalies,
        updatedAt: metrics.updated_at,
      });

    } catch (err) {
      tickers.push({
        ticker: bt.ticker,
        name: bt.ticker,
        sector: bt.sector,
        industry: bt.industry,
        industrySupport: { level: 'WARNING', reason: 'error' },
        scores: { quality: 0, growth: 0, valuation: 0, risk: 0, overall: 0 },
        status: 'WARNING',
        statusReason: `error: ${String(err)}`,
        anomalies: ['benchmark_error'],
        updatedAt: '',
      });
    }
  }

  return {
    tickers,
    summary: {
      total: { total: BENCHMARK_UNIVERSE.length, pass: totalPass, warning: totalWarning, fail: totalFail },
      ...sectorSummary,
    },
    industries: industryReport,
    anomalies,
  };
}
