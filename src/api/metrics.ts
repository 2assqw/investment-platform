import { getMetrics, getMetricDetails } from '../db';
import { Env, MetricBreakdownRow, IndustrySupportInfo } from '../types';
import { getIndustryInfo } from './helpers';

interface GroupedBreakdown {
  [engine: string]: Record<string, { value: number; score: number }>;
}

export async function handleMetrics(
  _request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const upper = ticker.toUpperCase();

  const [metrics, breakdownRows, info] = await Promise.all([
    getMetrics(env.DB, upper),
    getMetricDetails(env.DB, upper),
    getIndustryInfo(env.DB, upper),
  ]);

  if (!metrics) {
    return Response.json(
      { error: `No metrics for ${upper}. Run seed first.` },
      { status: 404 },
    );
  }

  const breakdown = groupBreakdowns(breakdownRows);

  return Response.json({
    ticker: metrics.ticker,
    industrySupport: info.support,
    warnings: info.warnings,
    scores: {
      quality: metrics.quality_score,
      growth: metrics.growth_score,
      valuation: metrics.valuation_score,
      risk: metrics.risk_score,
      overall: metrics.overall_score,
    },
    breakdown,
    updatedAt: metrics.updated_at,
  });
}

function groupBreakdowns(rows: MetricBreakdownRow[]): GroupedBreakdown {
  const grouped: GroupedBreakdown = {};
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
