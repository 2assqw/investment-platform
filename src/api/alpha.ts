import { Env } from '../types';
import { generateAlphaReport, validateFactors, getModelHealth } from '../backtest/alpha-engine';

export async function handleAlphaReport(_r: Request, env: Env): Promise<Response> {
  const report = await generateAlphaReport(env.DB);
  return Response.json(report);
}

export async function handleAlphaFactors(_r: Request, env: Env): Promise<Response> {
  const factors = await validateFactors(env.DB);
  return Response.json({ factors });
}

export async function handleModelHealth(_r: Request, env: Env): Promise<Response> {
  const health = await getModelHealth(env.DB);
  return Response.json(health);
}
