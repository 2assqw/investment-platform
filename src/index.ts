import { handleCompany, handleBreakdown, handleFinancials, handleMetrics, handleDebug, handleDataQuality, handleExplain } from './api';
import { handleTopOverall, handleTopQuality, handleTopGrowth, handleTopValue, handleTopRisk, handleTopShareholderAlignment, handleTopGrowthConsistency, handleTopCashConversion, handleScreener, handleDiscover } from './api/rankings';
import { handleHistory, handleHistoryChanges, handleHistoryTrends, handleTrendingRankings } from './api/history';
import { runHistorySnapshot } from './jobs/snapshot-history';
import { snapshotAllScores } from './db';
import { handleAddWatchlist, handleGetWatchlist, handleDeleteWatchlist, handleWatchlistAlerts, handleOpportunities } from './api/watchlist';
import { generateOpportunities, persistOpportunities } from './opportunities/opportunity-engine';
import { handleThesis, handleResearch, handleDiscoverTheses, handleThesisRanking } from './api/thesis';
import { handleAlphaReport, handleAlphaFactors, handleModelHealth } from './api/alpha';
import { handlePortfolio, handlePortfolios, handlePortfolioHealth } from './api/portfolio';
import { handleInitRegistry, handleFactorReports, handleFactorCompare, handleFactorRankings, handleFactorDashboard, handleResearchPortfolio, handlePromoteFactors } from './api/research';
import { handleInitResearchOS, handleHypotheses, handleExperiments, handleKnowledge, handleDecisions, handleResearchDashboard, handleLogDecision } from './api/research-os';
import { handleInitWeights, handleGetWeights, handleUpdateWeights, handleModelEvolution, handleAttribution, handleCompareModels, handleRegime } from './api/adaptive';
import { handlePrices, handleReturns, handleBenchmark } from './api/prices';
import { fetchHistoricalPrices, insertPrices, computeForwardReturns } from './providers/price-provider';
import { handleSeedPrices, handleSeedBenchmarks, handlePriceCoverage, handleValidatePrices } from './admin/seed-prices';
import { upsertPrices } from './db/prices';
import { updateValuation } from './jobs/update-valuation';
import { updateFundamentals } from './jobs/update-fundamentals';
import { updateAll } from './jobs/update-all';
import { seedNVDA } from './admin/seed-nvda';
import { seedTicker } from './admin/seed';
import { generateCoverageReport } from './admin/model-coverage';
import { handleBenchmarkReport } from './benchmarks/benchmark-report';
import { handleComputeBenchmarks } from './admin/compute-benchmarks';
import { handleBatchSeed, handleCoverageReport } from './admin/batch-seed';
import { secEdgarProvider } from './providers';
import { listTickers } from './db';
import { Env, ErrorResponse } from './types';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function notFound(): Response {
  const body: ErrorResponse = { error: 'Not found', status: 404 };
  return Response.json(body, { status: 404, headers: corsHeaders() });
}

function wrapCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // GET /api/company/:ticker
    const companyMatch = path.match(/^\/api\/company\/([A-Za-z]{1,5})$/);
    if (companyMatch && request.method === 'GET') {
      const res = await handleCompany(request, env, companyMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/company/:ticker/breakdown
    const breakdownMatch = path.match(/^\/api\/company\/([A-Za-z]{1,5})\/breakdown$/);
    if (breakdownMatch && request.method === 'GET') {
      const res = await handleBreakdown(request, env, breakdownMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/company/:ticker/financials
    const financialsMatch = path.match(/^\/api\/company\/([A-Za-z]{1,5})\/financials$/);
    if (financialsMatch && request.method === 'GET') {
      const res = await handleFinancials(request, env, financialsMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/metrics/:ticker  (P0: combined scores + breakdown, no cache)
    const metricsMatch = path.match(/^\/api\/metrics\/([A-Za-z]{1,5})$/);
    if (metricsMatch && request.method === 'GET') {
      const res = await handleMetrics(request, env, metricsMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/debug/:ticker  (full pipeline transparency, read-only)
    const debugMatch = path.match(/^\/api\/debug\/([A-Za-z]{1,5})$/);
    if (debugMatch && request.method === 'GET') {
      const res = await handleDebug(request, env, debugMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/debug/data-quality/:ticker  (financial data integrity report)
    const dqMatch = path.match(/^\/api\/debug\/data-quality\/([A-Za-z]{1,5})$/);
    if (dqMatch && request.method === 'GET') {
      const res = await handleDataQuality(request, env, dqMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/explain/:ticker  (V1.3 explainability — why the score, strengths, weaknesses, trust)
    const explainMatch = path.match(/^\/api\/explain\/([A-Za-z]{1,5})$/);
    if (explainMatch && request.method === 'GET') {
      const res = await handleExplain(request, env, explainMatch[1]!);
      return wrapCors(res);
    }

    // GET /api/admin/seed-nvda  (legacy)
    if (path === '/api/admin/seed-nvda' && request.method === 'GET') {
      const res = await seedNVDA(env);
      return wrapCors(res);
    }

    // GET /api/admin/seed/:ticker  (generic: seed any ticker)
    const seedMatch = path.match(/^\/api\/admin\/seed\/([A-Za-z]{1,5})$/);
    if (seedMatch && request.method === 'GET') {
      const refresh = url.searchParams.get('refresh') === 'true';
      const res = await seedTicker(env, seedMatch[1]!, refresh);
      return wrapCors(res);
    }

    // GET /api/admin/batch-seed?start=0&limit=10  (batch seed from SEC ticker list)
    if (path === '/api/admin/batch-seed' && request.method === 'GET') {
      const res = await handleBatchSeed(env, url);
      return wrapCors(res);
    }

    // GET /api/admin/coverage-report  (universe coverage stats)
    if (path === '/api/admin/coverage-report' && request.method === 'GET') {
      const res = await handleCoverageReport(env);
      return wrapCors(res);
    }

    // GET /api/admin/debug-key  (check if FMP_API_KEY secret is accessible)
    if (path === '/api/admin/debug-key' && request.method === 'GET') {
      const rawEnv = env as unknown as Record<string, unknown>;
      const keys = Object.keys(rawEnv).filter(k => k.includes('KEY') || k.includes('FMP') || k.includes('API'));
      return wrapCors(Response.json({ keysFound: keys, hasFmp: typeof rawEnv.FMP_API_KEY === 'string', fmpLen: typeof rawEnv.FMP_API_KEY === 'string' ? (rawEnv.FMP_API_KEY as string).length : 0 }));
    }

    // GET /api/admin/debug-tencent  (test Tencent API from Worker)
    if (path === '/api/admin/debug-tencent' && request.method === 'GET') {
      try {
        const res = await fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=usAAPL,day,2020-01-01,,10,qfq', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const text = await res.text();
        return wrapCors(Response.json({ status: res.status, size: text.length, preview: text.substring(0, 200) }));
      } catch (e) { return wrapCors(Response.json({ error: String(e) })); }

    // GET /api/admin/debug-av  (test Alpha Vantage directly)
    if (path === '/api/admin/debug-av' && request.method === 'GET') {
      const k = (env as unknown as Record<string, unknown>).ALPHA_VANTAGE_KEY;
      if (!k || k === 'demo') return wrapCors(Response.json({ error: 'AV key not set or is demo' }));
      const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=AAPL&outputsize=compact&apikey=${k}`);
      const text = await res.text();
      return wrapCors(Response.json({ ok: true, size: text.length, preview: text.substring(0, 300) }));
    }
    }

    // GET /api/admin/debug-stooq  (test fetchStooqPrices directly)
    if (path === '/api/admin/debug-stooq' && request.method === 'GET') {
      const { fetchStooqPrices } = await import('./providers/stooq');
      const ticker = url.searchParams.get('ticker') ?? 'AAPL';
      const rows = await fetchStooqPrices(ticker);
      return wrapCors(Response.json({ ticker, count: rows.length, first: rows[0], last: rows[rows.length-1] }));
    }

    // GET /api/admin/fetch-prices?ticker=NVDA  (manual price fetch)
    if (path === '/api/admin/fetch-prices' && request.method === 'GET') {
      const ticker = url.searchParams.get('ticker') ?? 'SPY';
      const prices = await fetchHistoricalPrices(ticker, '2010-01-01', '2026-12-31', env as unknown as Record<string, unknown>);
      const count = await insertPrices(env.DB, prices);
      if (prices.length > 0) { await computeForwardReturns(env.DB, ticker); }
      return wrapCors(Response.json({ ok: true, ticker, fetched: prices.length, inserted: count }));
    }

    // Price endpoints
    const priceMatch = path.match(/^\/api\/prices\/([A-Za-z]{1,5})$/);
    if (priceMatch && request.method === 'GET') { const res = await handlePrices(request, env, priceMatch[1]!); return wrapCors(res); }
    const returnMatch = path.match(/^\/api\/returns\/([A-Za-z]{1,5})$/);
    if (returnMatch && request.method === 'GET') { const res = await handleReturns(request, env, returnMatch[1]!); return wrapCors(res); }
    if (path === '/api/benchmark' && request.method === 'GET') { const res = await handleBenchmark(request, env); return wrapCors(res); }

    // Stooq price seeding
    const seedPriceMatch = path.match(/^\/api\/admin\/seed-prices\/([A-Za-z]{1,5})$/);
    if (seedPriceMatch && request.method === 'GET') { const res = await handleSeedPrices(request, env, seedPriceMatch[1]!); return wrapCors(res); }
    if (path === '/api/admin/seed-benchmarks' && request.method === 'GET') { const res = await handleSeedBenchmarks(env); return wrapCors(res); }
    if (path === '/api/admin/price-coverage' && request.method === 'GET') { const res = await handlePriceCoverage(env); return wrapCors(res); }
    if (path === '/api/admin/validate-prices' && request.method === 'GET') { const res = await handleValidatePrices(env); return wrapCors(res); }

    // POST /api/admin/upload-prices — receive prices from local script
    if (path === '/api/admin/upload-prices' && request.method === 'POST') {
      try {
        const body = await request.json() as { ticker?: string; rows?: Array<{ ticker: string; date: string; openPrice: number; highPrice: number; lowPrice: number; closePrice: number; volume: number; source: string }> };
        if (!body.ticker || !body.rows) return wrapCors(Response.json({ ok: false, error: 'ticker and rows required' }, { status: 400 }));
        const mapped = body.rows.map(r => ({
          ticker: r.ticker, date: r.date, open_price: r.openPrice, high_price: r.highPrice,
          low_price: r.lowPrice, close_price: r.closePrice, volume: r.volume, source: r.source ?? 'stooq-local',
        }));
        const count = await upsertPrices(env.DB, mapped);
        return wrapCors(Response.json({ ok: true, ticker: body.ticker, inserted: count }));
      } catch (e) { return wrapCors(Response.json({ ok: false, error: String(e) }, { status: 500 })); }
    }

    // GET /api/admin/model-coverage  (sector validation report)
    if (path === '/api/admin/model-coverage' && request.method === 'GET') {
      const res = await generateCoverageReport(env);
      return wrapCors(res);
    }

    // GET /api/admin/run-benchmark  (18-ticker benchmark validation)
    if (path === '/api/admin/run-benchmark' && request.method === 'GET') {
      const res = await handleBenchmarkReport(env);
      return wrapCors(res);
    }

    // POST /api/admin/compute-benchmarks  (compute valuation benchmarks)
    if (path === '/api/admin/compute-benchmarks' && (request.method === 'POST' || request.method === 'GET')) {
      const res = await handleComputeBenchmarks(env);
      return wrapCors(res);
    }

    // V1.4 Rankings & Screening
    if (path === '/api/rankings/top-overall' && request.method === 'GET') { const res = await handleTopOverall(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-quality' && request.method === 'GET') { const res = await handleTopQuality(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-growth' && request.method === 'GET') { const res = await handleTopGrowth(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-value' && request.method === 'GET') { const res = await handleTopValue(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-risk' && request.method === 'GET') { const res = await handleTopRisk(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-shareholder-alignment' && request.method === 'GET') { const res = await handleTopShareholderAlignment(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-growth-consistency' && request.method === 'GET') { const res = await handleTopGrowthConsistency(env, url); return wrapCors(res); }
    if (path === '/api/rankings/top-cash-conversion' && request.method === 'GET') { const res = await handleTopCashConversion(env, url); return wrapCors(res); }
    if (path === '/api/screener' && request.method === 'GET') { const res = await handleScreener(env, url); return wrapCors(res); }
    if (path === '/api/discover' && request.method === 'GET') { const res = await handleDiscover(env); return wrapCors(res); }

    // V1.6 Score History + Trends
    const historyMatch = path.match(/^\/api\/history\/([A-Za-z]{1,5})$/);
    if (historyMatch && request.method === 'GET') { const res = await handleHistory(request, env, historyMatch[1]!); return wrapCors(res); }
    const changesMatch = path.match(/^\/api\/history\/([A-Za-z]{1,5})\/changes$/);
    if (changesMatch && request.method === 'GET') { const res = await handleHistoryChanges(request, env, changesMatch[1]!); return wrapCors(res); }
    const trendsMatch = path.match(/^\/api\/history\/([A-Za-z]{1,5})\/trends$/);
    if (trendsMatch && request.method === 'GET') { const res = await handleHistoryTrends(request, env, trendsMatch[1]!); return wrapCors(res); }

    // GET /api/rankings/trending
    if (path === '/api/rankings/trending' && request.method === 'GET') { const res = await handleTrendingRankings(request, env); return wrapCors(res); }

    // Manual snapshot trigger
    if (path === '/api/admin/snapshot-history' && request.method === 'GET') { await snapshotAllScores(env.DB); return wrapCors(Response.json({ ok: true })); }
    // Manual opportunity generation
    if (path === '/api/admin/generate-opportunities' && request.method === 'GET') {
      try {
        const ops = await generateOpportunities(env.DB);
        await persistOpportunities(env.DB, ops);
        return wrapCors(Response.json({ ok: true, count: ops.length }));
      } catch (e) { return wrapCors(Response.json({ ok: false, error: String(e) }, { status: 500 })); }
    }

    // V1.5 Watchlist + Opportunities
    if (path === '/api/watchlist' && request.method === 'POST') { const res = await handleAddWatchlist(request, env); return wrapCors(res); }
    if (path === '/api/watchlist' && request.method === 'GET') { const res = await handleGetWatchlist(request, env); return wrapCors(res); }
    const wlDeleteMatch = path.match(/^\/api\/watchlist\/([A-Za-z]{1,5})$/);
    if (wlDeleteMatch && request.method === 'DELETE') { const res = await handleDeleteWatchlist(request, env, wlDeleteMatch[1]!); return wrapCors(res); }
    if (path === '/api/watchlist/alerts' && request.method === 'GET') { const res = await handleWatchlistAlerts(request, env); return wrapCors(res); }
    if (path === '/api/opportunities' && request.method === 'GET') { const res = await handleOpportunities(request, env); return wrapCors(res); }

    // V1.7 Thesis Engine
    const thesisMatch = path.match(/^\/api\/thesis\/([A-Za-z]{1,5})$/);
    if (thesisMatch && request.method === 'GET') { const res = await handleThesis(request, env, thesisMatch[1]!); return wrapCors(res); }
    const researchMatch = path.match(/^\/api\/research\/([A-Za-z]{1,5})$/);
    if (researchMatch && request.method === 'GET') { const res = await handleResearch(request, env, researchMatch[1]!); return wrapCors(res); }
    if (path === '/api/discover/theses' && request.method === 'GET') { const res = await handleDiscoverTheses(request, env); return wrapCors(res); }
    const thesisRankMatch = path.match(/^\/api\/rankings\/thesis\/([a-z-]+)$/);
    if (thesisRankMatch && request.method === 'GET') { const res = await handleThesisRanking(request, env, thesisRankMatch[1]!); return wrapCors(res); }

    // V2.0 Alpha Validation
    if (path === '/api/alpha/report' && request.method === 'GET') { const res = await handleAlphaReport(request, env); return wrapCors(res); }
    if (path === '/api/alpha/factors' && request.method === 'GET') { const res = await handleAlphaFactors(request, env); return wrapCors(res); }
    if (path === '/api/model-health' && request.method === 'GET') { const res = await handleModelHealth(request, env); return wrapCors(res); }

    // V2.1 Portfolio Construction
    if (path === '/api/portfolios' && request.method === 'GET') { const res = await handlePortfolios(request, env); return wrapCors(res); }
    const pfMatch = path.match(/^\/api\/portfolio\/([a-z-]+)$/);
    if (pfMatch && request.method === 'GET') { const res = await handlePortfolio(request, env, pfMatch[1]!); return wrapCors(res); }
    const pfHealthMatch = path.match(/^\/api\/portfolio\/([a-z-]+)\/health$/);
    if (pfHealthMatch && request.method === 'GET') { const res = await handlePortfolioHealth(request, env, pfHealthMatch[1]!); return wrapCors(res); }

    // V3.0 Factor Research Lab
    if (path === '/api/admin/init-registry' && request.method === 'GET') { const res = await handleInitRegistry(request, env); return wrapCors(res); }
    if (path === '/api/admin/promote-factors' && request.method === 'GET') { const res = await handlePromoteFactors(request, env); return wrapCors(res); }
    if (path === '/api/research/factors' && request.method === 'GET') { const res = await handleFactorReports(request, env); return wrapCors(res); }
    if (path === '/api/research/compare' && request.method === 'GET') { const res = await handleFactorCompare(request, env); return wrapCors(res); }
    if (path === '/api/research/rankings' && request.method === 'GET') { const res = await handleFactorRankings(request, env); return wrapCors(res); }
    if (path === '/api/research/dashboard' && request.method === 'GET') { const res = await handleFactorDashboard(request, env); return wrapCors(res); }
    if (path === '/api/research/portfolio' && request.method === 'GET') { const res = await handleResearchPortfolio(request, env); return wrapCors(res); }

    // V5.0 Research Operating System
    if (path === '/api/admin/init-research-os' && request.method === 'GET') { const res = await handleInitResearchOS(request, env); return wrapCors(res); }
    if (path === '/api/research/hypotheses' && request.method === 'GET') { const res = await handleHypotheses(request, env); return wrapCors(res); }
    if (path === '/api/research/experiments' && request.method === 'GET') { const res = await handleExperiments(request, env); return wrapCors(res); }
    if (path === '/api/research/knowledge' && request.method === 'GET') { const res = await handleKnowledge(request, env); return wrapCors(res); }
    if (path === '/api/research/decisions' && request.method === 'GET') { const res = await handleDecisions(request, env); return wrapCors(res); }
    if (path === '/api/research/os-dashboard' && request.method === 'GET') { const res = await handleResearchDashboard(request, env); return wrapCors(res); }
    if (path === '/api/research/decisions' && request.method === 'POST') { const res = await handleLogDecision(request, env); return wrapCors(res); }

    // V4.0 Adaptive Scoring
    if (path === '/api/admin/init-weights' && request.method === 'GET') { const res = await handleInitWeights(request, env); return wrapCors(res); }
    if (path === '/api/admin/update-weights' && request.method === 'GET') { const res = await handleUpdateWeights(request, env); return wrapCors(res); }
    if (path === '/api/model/weights' && request.method === 'GET') { const res = await handleGetWeights(request, env); return wrapCors(res); }
    if (path === '/api/model/evolution' && request.method === 'GET') { const res = await handleModelEvolution(request, env); return wrapCors(res); }
    if (path === '/api/model/attribution' && request.method === 'GET') { const res = await handleAttribution(request, env); return wrapCors(res); }
    if (path === '/api/model/compare' && request.method === 'GET') { const res = await handleCompareModels(request, env); return wrapCors(res); }
    if (path === '/api/model/regime' && request.method === 'GET') { const res = await handleRegime(request); return wrapCors(res); }

    return notFound();
  },

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;

    if (cron.includes('* * 0')) {
      // Weekly: fundamentals
      console.log('[scheduled] Running weekly fundamentals job');
      const tickers = await listTickers(env.DB);
      await updateFundamentals(env, tickers);
      return;
    }

    // Default: daily valuation + history + opportunities + price fetcher
    console.log('[scheduled] Running daily pipeline');
    await updateValuation(env, secEdgarProvider);
    await runHistorySnapshot(env);
    const ops = await generateOpportunities(env.DB);
    await persistOpportunities(env.DB, ops);

    // Fetch latest prices for all active tickers
    const activeTickers = await env.DB.prepare('SELECT ticker FROM metrics WHERE overall_score > 0').all<{ ticker: string }>();
    for (const row of activeTickers.results) {
      try {
        const today = new Date().toISOString().split('T')[0]!;
        const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
        const prices = await fetchHistoricalPrices(row.ticker, monthAgo!, today, env as unknown as Record<string, unknown>);
        if (prices.length > 0) {
          await insertPrices(env.DB, prices);
          await computeForwardReturns(env.DB, row.ticker);
        }
      } catch { /* skip failed tickers */ }
    }
    console.log('[scheduled] Daily price update complete');
  },
};
