import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide } from './scoring';
import { FinancialRow } from '../types';

// ============================================================
// Model metadata
// ============================================================

const ALTMAN_MODEL = 'simplified-v1';
const FSCORE_MODEL = 'simplified-8factor-v1';
const MSCORE_MODEL = 'simplified-4factor-v1';

// Maximum possible contribution from each metric
const ALTMAN_MAX = 33;
const FSCORE_MAX = 33;
const MSCORE_MAX = 34;

// ============================================================
// Breakdown item shape
// ============================================================

interface RiskMetric {
  value: number | null;
  score: number;
  available: boolean;
  model: string;
  reason?: string;
}

// ============================================================
// Altman Z-Score (simplified — single period is sufficient)
// ============================================================

function computeAltmanZ(f: FinancialRow): number {
  const x1 = safeDivide(f.shareholder_equity, f.total_assets);
  const x3 = safeDivide(f.operating_income, f.total_assets);
  const x5 = safeDivide(f.revenue, f.total_assets);
  return 1.2 * x1 + 3.3 * x3 + 1.0 * x5;
}

function scoreAltman(z: number): number {
  if (z > 3.0) return ALTMAN_MAX;
  if (z > 2.0) return 25;
  if (z > 1.0) return 17;
  if (z > 0) return 8;
  return 0;
}

// ============================================================
// Piotroski F-Score (0-8, simplified — requires 2 periods)
// ============================================================

function computeFScore(current: FinancialRow, prior: FinancialRow): number {
  let score = 0;

  // 1. Positive net income
  if (current.net_income > 0) score++;

  // 2. Positive operating cash flow
  if (current.operating_cash_flow > 0) score++;

  // 3. ROA increasing
  if (safeDivide(current.net_income, current.total_assets) > safeDivide(prior.net_income, prior.total_assets)) score++;

  // 4. Operating cash flow > net income (quality of earnings)
  if (current.operating_cash_flow > current.net_income) score++;

  // 5. Debt ratio decreasing
  if (safeDivide(current.total_liabilities, current.total_assets) < safeDivide(prior.total_liabilities, prior.total_assets)) score++;

  // 6. No dilution
  if (current.shares_outstanding <= prior.shares_outstanding) score++;

  // 7. Gross margin increasing
  if (safeDivide(current.gross_profit, current.revenue) > safeDivide(prior.gross_profit, prior.revenue)) score++;

  // 8. Asset turnover increasing
  if (safeDivide(current.revenue, current.total_assets) > safeDivide(prior.revenue, prior.total_assets)) score++;

  return score;
}

function scoreFScore(f: number): number {
  return Math.round((f / 8) * FSCORE_MAX);
}

// ============================================================
// Beneish M-Score (simplified 4-variable — requires 2 periods)
// ============================================================

function computeMScore(current: FinancialRow, prior: FinancialRow): number {
  const gmi = safeDivide(
    safeDivide(prior.gross_profit, prior.revenue),
    safeDivide(current.gross_profit, current.revenue),
  );
  const sgi = safeDivide(current.revenue, prior.revenue);
  const lvgi = safeDivide(
    safeDivide(current.total_liabilities, current.total_assets),
    safeDivide(prior.total_liabilities, prior.total_assets),
  );
  const tata = safeDivide(current.net_income - current.operating_cash_flow, current.total_assets);

  return -4.84 + 0.528 * gmi + 0.892 * sgi - 0.327 * lvgi + 4.679 * tata;
}

function scoreMScore(m: number): number {
  if (m < -2.22) return MSCORE_MAX;
  if (m > -1.78) return 0;
  return Math.round(MSCORE_MAX * safeDivide(-1.78 - m, 0.44));
}

// ============================================================
// Engine
// ============================================================

export const riskEngine: Engine = {
  name: 'risk',

  calculate(input: EngineInput): EngineOutput {
    const sorted = [...input.financials].sort((a, b) => b.fiscal_year - a.fiscal_year);
    const latest = sorted[0];
    const prior = sorted[1]; // undefined if < 2 periods — never fall back to latest

    if (!latest) {
      return { score: 0, breakdown: {} };
    }

    const hasPrior = prior !== undefined;

    // --- Altman Z (always available with single period) ---

    const altmanZ = roundToDecimal(computeAltmanZ(latest), 2);
    const altmanScore = scoreAltman(altmanZ);

    // --- Piotroski F-Score (requires 2 periods) ---

    let fMetric: RiskMetric;
    if (hasPrior) {
      const rawF = computeFScore(latest, prior);
      fMetric = {
        value: rawF,
        score: scoreFScore(rawF),
        available: true,
        model: FSCORE_MODEL,
      };
    } else {
      fMetric = {
        value: null,
        score: 0,
        available: false,
        model: FSCORE_MODEL,
        reason: 'insufficient_history',
      };
    }

    // --- Beneish M-Score (requires 2 periods) ---

    let mMetric: RiskMetric;
    if (hasPrior) {
      const rawM = roundToDecimal(computeMScore(latest, prior), 2);
      mMetric = {
        value: rawM,
        score: clamp(scoreMScore(rawM), 0, MSCORE_MAX),
        available: true,
        model: MSCORE_MODEL,
      };
    } else {
      mMetric = {
        value: null,
        score: 0,
        available: false,
        model: MSCORE_MODEL,
        reason: 'insufficient_history',
      };
    }

    // --- Adaptive scoring: normalize by available max ---

    const availableMax = ALTMAN_MAX + (hasPrior ? FSCORE_MAX + MSCORE_MAX : 0);
    const actualScore = altmanScore + fMetric.score + mMetric.score;
    const totalScore = availableMax > 0
      ? clamp(Math.round((actualScore / availableMax) * 100), 0, 100)
      : 0;

    return {
      score: totalScore,
      breakdown: {
        altmanZ: {
          value: altmanZ,
          score: altmanScore,
          available: true,
          model: ALTMAN_MODEL,
        },
        piotroskiF: fMetric,
        beneishM: mMetric,
      },
    };
  },
};
