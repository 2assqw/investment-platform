import { qualityEngine, growthEngine, riskEngine } from '../engines';
import { EngineInput } from '../engines/types';
import {
  getFinancials,
  getMetrics,
  upsertMetrics,
  replaceMetricBreakdowns,
} from '../db';
import { invalidateCache } from '../cache';
import { Env } from '../types';

function breakdownToRows(breakdown: Record<string, unknown>): Array<{ name: string; value: number; score: number }> {
  const result: Array<{ name: string; value: number; score: number }> = [];
  for (const [key, val] of Object.entries(breakdown)) {
    if (
      typeof val === 'object' &&
      val !== null &&
      'value' in val &&
      'score' in val
    ) {
      const v = val as { value: number; score: number };
      if (typeof v.value === 'number' && typeof v.score === 'number') {
        result.push({ name: key, value: v.value, score: v.score });
      }
    }
  }
  return result;
}

/**
 * Weekly cron job: run quality, growth, risk engines for all tickers.
 * Preserves valuation score (set by daily job).
 */
export async function updateFundamentals(
  env: Env,
  tickers: string[],
): Promise<void> {
  console.log(`[update-fundamentals] Processing ${tickers.length} tickers...`);

  for (const ticker of tickers) {
    try {
      const financials = await getFinancials(env.DB, ticker);
      if (financials.length === 0) continue;

      const input: EngineInput = { ticker, financials };

      const qualityResult = qualityEngine.calculate(input);
      const growthResult = growthEngine.calculate(input);
      const riskResult = riskEngine.calculate(input);

      // Preserve valuation from existing metrics
      const existing = await getMetrics(env.DB, ticker);
      const valuationScore = existing?.valuation_score ?? 0;

      const overallScore = Math.round(
        qualityResult.score * 0.30 +
        growthResult.score * 0.30 +
        valuationScore * 0.20 +
        riskResult.score * 0.20,
      );

      await upsertMetrics(env.DB, {
        ticker,
        quality_score: qualityResult.score,
        growth_score: growthResult.score,
        valuation_score: valuationScore,
        risk_score: riskResult.score,
        overall_score: overallScore,
        consistency_score: 0,
        updated_at: '',
      });

      // Store breakdowns for each engine
      await replaceMetricBreakdowns(env.DB, ticker, 'quality', breakdownToRows(qualityResult.breakdown));
      await replaceMetricBreakdowns(env.DB, ticker, 'growth', breakdownToRows(growthResult.breakdown));
      await replaceMetricBreakdowns(env.DB, ticker, 'risk', breakdownToRows(riskResult.breakdown));

      // Invalidate cache
      await invalidateCache(ticker, env.KV);
    } catch (err) {
      console.error(`[update-fundamentals] Failed for ${ticker}:`, err);
    }
  }

  console.log('[update-fundamentals] Complete');
}
