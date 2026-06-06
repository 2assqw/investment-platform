import { ScoreContext, ScoreAnomaly } from './types';

// ============================================================
// Safety helpers
// ============================================================

function safeNum(v: number): boolean {
  return Number.isFinite(v);
}

// ============================================================
// Individual detection rules
// ============================================================

export function detectGrowthLowForPass(ctx: ScoreContext): ScoreAnomaly | null {
  if (ctx.industrySupport === 'PASS' && safeNum(ctx.growth) && ctx.growth < 25) {
    return {
      type: 'growth_low_pass',
      detail: `Growth score ${ctx.growth} < 25 for PASS industry — may indicate data quality issue or mature company`,
    };
  }
  return null;
}

export function detectQualityLowMegacap(ctx: ScoreContext): ScoreAnomaly | null {
  if (ctx.industrySupport === 'PASS' && safeNum(ctx.quality) && ctx.quality < 50) {
    return {
      type: 'quality_low_pass',
      detail: `Quality score ${ctx.quality} < 50 for PASS industry — check ROE/ROIC/FCF data`,
    };
  }
  return null;
}

export function detectRiskZero(ctx: ScoreContext): ScoreAnomaly | null {
  if (ctx.risk === 0) {
    return {
      type: 'risk_zero',
      detail: 'Risk score is 0 — engine may have insufficient data or all metrics unavailable',
    };
  }
  return null;
}

export function detectGrowthZero(ctx: ScoreContext): ScoreAnomaly | null {
  if (ctx.growth === 0) {
    return {
      type: 'growth_zero',
      detail: 'Growth score is 0 — insufficient fiscal years for CAGR calculation',
    };
  }
  return null;
}

export function detectQualityZero(ctx: ScoreContext): ScoreAnomaly | null {
  if (ctx.quality === 0) {
    return {
      type: 'quality_zero',
      detail: 'Quality score is 0 — check financial data availability',
    };
  }
  return null;
}

export function detectMissingBreakdown(ctx: ScoreContext, expectedEngines: string[]): ScoreAnomaly | null {
  if (!Array.isArray(ctx.breakdowns)) return null;
  const presentEngines = new Set(ctx.breakdowns.map((b) => b?.engine).filter(Boolean));
  const missing = expectedEngines.filter((e) => !presentEngines.has(e));
  if (missing.length > 0) {
    return {
      type: 'missing_breakdown',
      detail: `Missing breakdown data for engines: ${missing.join(', ')}`,
    };
  }
  return null;
}

export function detectCagrDivergence(ctx: ScoreContext): ScoreAnomaly | null {
  if (!Array.isArray(ctx.breakdowns)) return null;

  const revRow = ctx.breakdowns.find((b) => b?.engine === 'growth' && b?.metric_name === 'revenueCagr');
  const epsRow = ctx.breakdowns.find((b) => b?.engine === 'growth' && b?.metric_name === 'epsCagr');

  if (revRow && epsRow) {
    const revCagr = revRow.metric_value;
    const epsCagr = epsRow.metric_value;
    if (safeNum(revCagr) && safeNum(epsCagr) && revCagr > 5 && epsCagr < -5) {
      return {
        type: 'cagr_divergence',
        detail: `Revenue CAGR +${revCagr.toFixed(1)}% vs EPS CAGR ${epsCagr.toFixed(1)}% — possible stock split or data distortion`,
      };
    }
  }
  return null;
}

export function detectSplitWarning(ctx: ScoreContext): ScoreAnomaly | null {
  if (ctx.hasSplitWarning) {
    return {
      type: 'possible_stock_split',
      detail: 'Normalizer detected share count ratio anomaly — EPS-based metrics may be unreliable',
    };
  }
  return null;
}

export function detectScoreOutOfBounds(ctx: ScoreContext): ScoreAnomaly | null {
  const scores = [ctx.quality, ctx.growth, ctx.risk, ctx.overall];
  const oob = scores.filter((s) => !safeNum(s) || s < 0 || s > 100);
  if (oob.length > 0) {
    return {
      type: 'score_out_of_bounds',
      detail: `Scores outside 0-100 range: ${oob.join(', ')}`,
    };
  }
  return null;
}

// ============================================================
// Batch detection — wrapped in try/catch to never throw
// ============================================================

export function detectAll(ctx: ScoreContext): ScoreAnomaly[] {
  if (!ctx) return [];

  const checks = [
    detectGrowthLowForPass(ctx),
    detectQualityLowMegacap(ctx),
    detectRiskZero(ctx),
    detectGrowthZero(ctx),
    detectQualityZero(ctx),
    detectMissingBreakdown(ctx, ['quality', 'growth', 'risk']),
    detectCagrDivergence(ctx),
    detectSplitWarning(ctx),
    detectScoreOutOfBounds(ctx),
  ];

  return checks.filter((c): c is NonNullable<typeof c> => c !== null);
}
