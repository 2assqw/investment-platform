import { Env } from '../types';
import { generateRankings } from '../rankings/ranking-engine';
import { screenTickers } from '../rankings/screening-engine';
import { generateDiscovery } from '../rankings/discover-engine';

const LIMIT = 50;

export async function handleTopOverall(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'overall', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopQuality(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'quality', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopGrowth(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'growth', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopValue(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'valuation', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopRisk(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'risk', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopShareholderAlignment(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'shareholderAlignment', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopGrowthConsistency(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'growthConsistency', LIMIT, inc);
  return Response.json(res);
}

export async function handleTopCashConversion(env: Env, url: URL): Promise<Response> {
  const inc = url.searchParams.get('includeUnsupported') === 'true';
  const res = await generateRankings(env.DB, 'cashConversion', LIMIT, inc);
  return Response.json(res);
}

export async function handleScreener(env: Env, url: URL): Promise<Response> {
  const params = {
    sector: url.searchParams.get('sector') ?? undefined,
    industry: url.searchParams.get('industry') ?? undefined,
    overallMin: url.searchParams.get('overallMin') ? Number(url.searchParams.get('overallMin')) : undefined,
    qualityMin: url.searchParams.get('qualityMin') ? Number(url.searchParams.get('qualityMin')) : undefined,
    growthMin: url.searchParams.get('growthMin') ? Number(url.searchParams.get('growthMin')) : undefined,
    valuationMin: url.searchParams.get('valuationMin') ? Number(url.searchParams.get('valuationMin')) : undefined,
    riskMin: url.searchParams.get('riskMin') ? Number(url.searchParams.get('riskMin')) : undefined,
    trustMin: url.searchParams.get('trustMin') ? Number(url.searchParams.get('trustMin')) : undefined,
    growthConsistencyMin: url.searchParams.get('growthConsistencyMin') ? Number(url.searchParams.get('growthConsistencyMin')) : undefined,
    shareholderAlignmentMin: url.searchParams.get('shareholderAlignmentMin') ? Number(url.searchParams.get('shareholderAlignmentMin')) : undefined,
    cashConversionMin: url.searchParams.get('cashConversionMin') ? Number(url.searchParams.get('cashConversionMin')) : undefined,
    includeUnsupported: url.searchParams.get('includeUnsupported') === 'true',
  };
  const res = await screenTickers(env.DB, params);
  return Response.json(res);
}

export async function handleDiscover(env: Env): Promise<Response> {
  const res = await generateDiscovery(env.DB);
  return Response.json(res);
}
