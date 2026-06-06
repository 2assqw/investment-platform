import { Env } from '../types';
import { generateThesis, generateResearchSummary, generateThesesByCategory } from '../thesis/thesis-engine';
import { generateRankings } from '../rankings/ranking-engine';

export async function handleThesis(_r: Request, env: Env, ticker: string): Promise<Response> {
  const t = await generateThesis(env.DB, ticker);
  if (!t) return Response.json({ error: 'No data' }, { status: 404 });
  return Response.json(t);
}

export async function handleResearch(_r: Request, env: Env, ticker: string): Promise<Response> {
  const r = await generateResearchSummary(env.DB, ticker);
  if (!r) return Response.json({ error: 'No data' }, { status: 404 });
  return Response.json(r);
}

export async function handleDiscoverTheses(_r: Request, env: Env): Promise<Response> {
  const d = await generateThesesByCategory(env.DB);
  return Response.json({ generatedAt: new Date().toISOString(), ...d });
}

export async function handleThesisRanking(_r: Request, env: Env, thesisType: string): Promise<Response> {
  // Get all tickers, classify by thesis, filter and return
  const all = await env.DB.prepare('SELECT ticker FROM metrics WHERE overall_score > 0 LIMIT 30')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const results: Array<{ ticker: string; thesis: string | null; confidence: number }> = [];
  for (const ticker of all) {
    const t = await generateThesis(env.DB, ticker);
    if (!t) continue;

    const matches = (thesisType === 'high-quality-compounders' && t.primaryThesis === 'High Quality Compounder') ||
      (thesisType === 'elite-growth' && t.primaryThesis === 'Elite Growth Company') ||
      (thesisType === 'cash-machines' && (t.primaryThesis === 'Cash Flow Machine' || t.secondaryTheses.includes('Cash Flow Machine'))) ||
      (thesisType === 'shareholder-friendly' && (t.primaryThesis === 'Shareholder Friendly' || t.secondaryTheses.includes('Shareholder Friendly'))) ||
      (thesisType === 'deep-value' && t.primaryThesis === 'Deep Value Candidate');

    if (matches) results.push({ ticker, thesis: t.primaryThesis, confidence: t.confidence });
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return Response.json({ thesisType, count: results.length, results });
}
