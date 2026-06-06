import { Env } from '../types';
import { initFactorRegistry, getFactorReports, compareFactors, getFactorDashboard, buildResearchPortfolio, promoteFactors } from '../research/factor-lab';

export async function handleInitRegistry(_r: Request, env: Env): Promise<Response> {
  await initFactorRegistry(env.DB);
  const dashboard = await getFactorDashboard(env.DB);
  return Response.json({ ok: true, dashboard });
}

export async function handleFactorReports(_r: Request, env: Env): Promise<Response> {
  const reports = await getFactorReports(env.DB);
  return Response.json({ count: reports.length, reports });
}

export async function handleFactorCompare(_r: Request, env: Env): Promise<Response> {
  const comparison = await compareFactors(env.DB);
  return Response.json(comparison);
}

export async function handleFactorRankings(_r: Request, env: Env): Promise<Response> {
  const reports = await getFactorReports(env.DB);
  const topFactors = reports.filter(r => r.alphaScore > 0).map(r => r.factor);
  return Response.json({ topFactors });
}

export async function handleFactorDashboard(_r: Request, env: Env): Promise<Response> {
  const dashboard = await getFactorDashboard(env.DB);
  return Response.json(dashboard);
}

export async function handleResearchPortfolio(_r: Request, env: Env): Promise<Response> {
  const portfolio = await buildResearchPortfolio(env.DB);
  return Response.json(portfolio);
}

export async function handlePromoteFactors(_r: Request, env: Env): Promise<Response> {
  await promoteFactors(env.DB);
  const reports = await getFactorReports(env.DB);
  return Response.json({ ok: true, reports });
}
