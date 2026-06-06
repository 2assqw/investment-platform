import { Env } from '../types';
import { initWeights, getWeights, updateWeights, getWeightEvolution, getFactorAttribution, compareStaticVsAdaptive, computeAdaptiveScore } from '../adaptive/weight-engine';

export async function handleInitWeights(_r: Request, env: Env): Promise<Response> {
  await initWeights(env.DB);
  const weights = await getWeights(env.DB);
  return Response.json({ ok: true, weights });
}

export async function handleGetWeights(_r: Request, env: Env): Promise<Response> {
  const weights = await getWeights(env.DB);
  const formatted: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) formatted[k] = Math.round(v * 100);
  return Response.json(formatted);
}

export async function handleUpdateWeights(_r: Request, env: Env): Promise<Response> {
  // Simulate alpha data (in production, this comes from backtest)
  const alphaData = {
    quality: { alpha: 4.0, winRate: 58, sharpe: 0.9 },
    growth: { alpha: 2.0, winRate: 52, sharpe: 0.6 },
    valuation: { alpha: 7.0, winRate: 65, sharpe: 1.1 },
    risk: { alpha: 3.0, winRate: 55, sharpe: 0.7 },
  };
  const result = await updateWeights(env.DB, alphaData);
  const evolution = await getWeightEvolution(env.DB);
  return Response.json({ updated: result.updated, changes: result.changes, evolution });
}

export async function handleModelEvolution(_r: Request, env: Env): Promise<Response> {
  const evolution = await getWeightEvolution(env.DB);
  return Response.json({ evolution });
}

export async function handleAttribution(_r: Request, env: Env): Promise<Response> {
  const attribution = await getFactorAttribution(env.DB);
  return Response.json(attribution);
}

export async function handleCompareModels(_r: Request, env: Env): Promise<Response> {
  const scores = { quality: 80, growth: 66, valuation: 20, risk: 92 };
  const staticW = { quality: 0.30, growth: 0.30, valuation: 0.20, risk: 0.20 };
  const adaptiveW = await getWeights(env.DB);

  const staticScore = computeAdaptiveScore(scores, staticW);
  const adaptiveScore = computeAdaptiveScore(scores, adaptiveW);
  const comparison = compareStaticVsAdaptive(staticScore, adaptiveScore);

  return Response.json({ scores: Object.fromEntries(Object.entries(scores).map(([k,v]) => [k,v])), staticWeighted: staticScore, adaptiveWeighted: adaptiveScore, ...comparison });
}

export async function handleRegime(_r: Request): Promise<Response> {
  return Response.json({
    currentRegime: 'technology_bull',
    confidence: 65,
    description: 'Technology sector outperforming with strong growth and moderate valuation expansion.',
  });
}
