import { getMetrics, getMetricDetails, getFinancials } from '../db';
import { SupportLevel } from '../classification/types';
import { ScoreContext, ScoreValidationResult, ScoreAnomaly } from './types';
import { detectAll } from './anomaly-detector';

/**
 * Runs all score validation checks for a given ticker.
 * Returns validation warnings. Never throws — catches all errors internally.
 */
export async function validateScores(
  db: D1Database,
  ticker: string,
  industrySupport: SupportLevel,
): Promise<ScoreValidationResult> {
  const empty: ScoreValidationResult = { warnings: [], anomalies: [] };

  try {
    const [metrics, breakdowns, financials] = await Promise.all([
      getMetrics(db, ticker).catch(() => null),
      getMetricDetails(db, ticker).catch(() => []),
      getFinancials(db, ticker).catch(() => []),
    ]);

    if (!metrics) {
      return {
        warnings: ['score_validation_skipped'],
        anomalies: [{ type: 'no_metrics_data', detail: `No metrics in D1 for ${ticker}` }],
      };
    }

    // Sanitize scores: guard against NaN/Infinity from DB corruption or bad data
    const quality = Number.isFinite(metrics.quality_score) ? metrics.quality_score : 0;
    const growth = Number.isFinite(metrics.growth_score) ? metrics.growth_score : 0;
    const risk = Number.isFinite(metrics.risk_score) ? metrics.risk_score : 0;
    const overall = Number.isFinite(metrics.overall_score) ? metrics.overall_score : 0;

    if (quality === 0 && metrics.quality_score !== 0) {
      empty.warnings.push('score_warning:invalid_numeric_value');
    }
    if (growth === 0 && metrics.growth_score !== 0) {
      empty.warnings.push('score_warning:invalid_numeric_value');
    }
    if (risk === 0 && metrics.risk_score !== 0) {
      empty.warnings.push('score_warning:invalid_numeric_value');
    }

    // Detect stock splits from share count ratio (defensively)
    let hasSplitWarning = false;
    for (let i = 1; i < financials.length; i++) {
      const curr = financials[i];
      const prev = financials[i - 1];
      if (!curr || !prev) continue;
      const currShares = curr.shares_outstanding;
      const prevShares = prev.shares_outstanding;
      if (!Number.isFinite(currShares) || !Number.isFinite(prevShares)) continue;
      if (prevShares > 0 && currShares > 0) {
        const ratio = currShares / prevShares;
        if (Number.isFinite(ratio) && (ratio > 1.5 || ratio < 0.67)) {
          hasSplitWarning = true;
          break;
        }
      }
    }

    const ctx: ScoreContext = {
      ticker,
      quality,
      growth,
      risk,
      overall,
      industrySupport,
      breakdowns: Array.isArray(breakdowns) ? breakdowns : [],
      fiscalYears: Array.isArray(financials) ? financials.length : 0,
      hasSplitWarning,
    };

    let anomalies: ScoreAnomaly[] = [];
    try {
      anomalies = detectAll(ctx);
    } catch (detectErr) {
      console.error(`[score-validator] detectAll failed for ${ticker}:`, detectErr);
    }

    const warnings: string[] = [];
    for (const a of anomalies) {
      if (a && typeof a.type === 'string') {
        warnings.push(`score_warning:${a.type}`);
      }
    }

    return { warnings: [...empty.warnings, ...warnings], anomalies };

  } catch (err) {
    console.error(`[score-validator] fatal error for ${ticker}:`, err);
    return {
      warnings: ['validation_failed'],
      anomalies: [{ type: 'validation_exception', detail: String(err) }],
    };
  }
}

/**
 * Merges industry support warnings with score validation warnings.
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
 * Never throws — catches all errors internally.
 */
export async function runValidation(
  db: D1Database,
  ticker: string,
  industrySupport: SupportLevel,
  industryWarnings: string[],
): Promise<{ allWarnings: string[]; anomalies: ScoreAnomaly[] }> {
  try {
    const scoreResult = await validateScores(db, ticker, industrySupport);
    return {
      allWarnings: mergeWarnings(industryWarnings, scoreResult),
      anomalies: scoreResult.anomalies,
    };
  } catch (err) {
    console.error(`[runValidation] fatal error for ${ticker}:`, err);
    return {
      allWarnings: [...industryWarnings, 'validation_failed'],
      anomalies: [{ type: 'validation_exception', detail: String(err) }],
    };
  }
}
