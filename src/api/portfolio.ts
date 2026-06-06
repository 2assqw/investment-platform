import { Env } from '../types';
import { buildPortfolio, getPortfoliosSummary, getPortfolioHealth } from '../portfolio/portfolio-engine';

export async function handlePortfolio(_r: Request, env: Env, type: string): Promise<Response> {
  const portfolio = await buildPortfolio(env.DB, type);
  return Response.json(portfolio);
}

export async function handlePortfolios(_r: Request, env: Env): Promise<Response> {
  const summary = await getPortfoliosSummary(env.DB);
  return Response.json(summary);
}

export async function handlePortfolioHealth(_r: Request, env: Env, type: string): Promise<Response> {
  const portfolio = await buildPortfolio(env.DB, type);
  const health = await getPortfolioHealth(portfolio);
  return Response.json(health);
}
