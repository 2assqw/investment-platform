import { getMetrics, getMetricDetails, getFinancials } from '../db';
import { SupportLevel } from '../classification/types';
import { ScoreContext, ScoreValidationResult, ScoreAnomaly } from './types';
import { detectAll } from './anomaly-detector';

/**
 * Runs all score validation checks for a given ticker.
 * Returns validation warnings that supplement (not replace) industry support warnings.
 */
export async function validateScores(
  db: D1Database,
  ticker: string,
  industrySupport: SupportLevel,
): Promise<ScoreValidationResult> {
  const [metrics, breakdowns, financials] = await Promise.all([
    getMetrics(db, ticker),
    getMetricDetails(db, ticker),
    getFinancials(db, ticker),
  ]);

  if (!metrics) {
    return {
      warnings: ['score_validation_skipped'],
      anomalies: [{ type: 'no_metrics_data', detail: `No metrics in D1 for ${ticker}` }],
    };
  }

  // Detect stock splits from share count ratio
  let hasSplitWarning = false;
  for (let i = 1; i < financials.length; i++) {
    const curr = financials[i]!;
    const prev = financials[i - 1]!;
    if (prev.shares_outstanding > 0 && curr.shares_outstanding > 0) {
      const ratio = curr.shares_outstanding / prev.shares_outstanding;
      if (ratio > 1.5 || ratio < 0.67) {
        hasSplitWarning = true;
        break;
      }
    }
  }

  const ctx: ScoreContext = {
    ticker,
    quality: metrics.quality_score,
    growth: metrics.growth_score,
    risk: metrics.risk_score,
    overall: metrics.overall_score,
    industrySupport,
    breakdowns,
    fiscalYears: financials.length,
    hasSplitWarning,
  };

  const anomalies = detectAll(ctx);

  const warnings: string[] = [];
  for (const a of anomalies) {
    warnings.push(`score_warning:${a.type}`);
  }

  return { warnings, anomalies };
}

/**
 * Merges industry support warnings with score validation warnings.
 * Called by API handlers to build the final warnings array.
 */
export function mergeWarnings(
  industryWarnings: string[],
  scoreResult: ScoreValidationResult,
): string[] {
  const merged = [...industryWarnings, ...scoreResult.warnings];
  return [...new Set(merged)];
}

/**
 * Convenience: run full validation and return merged warnings.
 */
export async function runValidation(
  db: D1Database,
  ticker: string,
  industrySupport: SupportLevel,
  industryWarnings: string[],
): Promise<{ allWarnings: string[]; anomalies: ScoreAnomaly[] }> {
  const scoreResult = await validateScores(db, ticker, industrySupport);
  return {
    allWarnings: mergeWarnings(industryWarnings, scoreResult),
    anomalies: scoreResult.anomalies,
  };
}
