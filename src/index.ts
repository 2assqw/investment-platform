import { handleCompany, handleBreakdown, handleFinancials, handleMetrics } from './api';
import { updateValuation } from './jobs/update-valuation';
import { updateFundamentals } from './jobs/update-fundamentals';
import { updateAll } from './jobs/update-all';
import { seedNVDA } from './admin/seed-nvda';
import { seedTicker } from './admin/seed';
import { generateCoverageReport } from './admin/model-coverage';
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

    // GET /api/admin/model-coverage  (sector validation report)
    if (path === '/api/admin/model-coverage' && request.method === 'GET') {
      const res = await generateCoverageReport(env);
      return wrapCors(res);
    }

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

    // Default: daily valuation
    console.log('[scheduled] Running daily valuation job');
    await updateValuation(env, secEdgarProvider);
  },
};
