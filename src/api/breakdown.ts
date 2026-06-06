import { getCachedResponse } from '../cache';
import { getMetricDetails } from '../db';
import { BreakdownResponse, Env, ErrorResponse, MetricBreakdownRow } from '../types';
import { getIndustryInfo } from './helpers';

export async function handleBreakdown(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();

  return getCachedResponse(request, env.KV, upper, 'breakdown', async () => {
    const [rows, info] = await Promise.all([
      getMetricDetails(env.DB, upper),
      getIndustryInfo(env.DB, upper),
    ]);

    if (rows.length === 0) {
      const body: ErrorResponse = { error: `No breakdown data for ${upper}`, status: 404 };
      return Response.json(body, { status: 404 });
    }

    const grouped = groupBreakdowns(rows);

    const body: BreakdownResponse = {
      ticker: upper,
      industrySupport: info.support,
      warnings: info.warnings,
      quality: grouped.quality ?? {},
      growth: grouped.growth ?? {},
      valuation: grouped.valuation ?? {},
      risk: grouped.risk ?? {},
    };

    return Response.json(body);
  });
}

function groupBreakdowns(
  rows: MetricBreakdownRow[],
): Record<string, Record<string, { value: number; score: number }>> {
  const grouped: Record<string, Record<string, { value: number; score: number }>> = {};
  for (const row of rows) {
    if (!grouped[row.engine]) {
      grouped[row.engine] = {};
    }
    grouped[row.engine]![row.metric_name] = {
      value: row.metric_value,
      score: row.metric_score,
    };
  }
  return grouped;
}
