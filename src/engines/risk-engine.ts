import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, safeDivide } from './scoring';
import { FinancialRow } from '../types';

// === Altman Z-Score (simplified — no market cap in engine) ===

function computeAltmanZ(f: FinancialRow): number {
  const x1 = safeDivide(f.shareholder_equity, f.total_assets);
  const x3 = safeDivide(f.operating_income, f.total_assets);
  const x5 = safeDivide(f.revenue, f.total_assets);
  return 1.2 * x1 + 3.3 * x3 + 1.0 * x5;
}

function scoreAltman(z: number): number {
  if (z > 3.0) return 33;
  if (z > 2.0) return 25;
  if (z > 1.0) return 17;
  if (z > 0) return 8;
  return 0;
}

// === Piotroski F-Score (0-8, simplified) ===

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
  return Math.round((f / 8) * 33);
}

// === Beneish M-Score (simplified 4-variable) ===

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
  // M < -2.22 = unlikely manipulator → high score
  // M > -1.78 = likely manipulator → low score
  if (m < -2.22) return 34;
  if (m > -1.78) return 0;
  return Math.round(34 * safeDivide(-1.78 - m, 0.44));
}

export const riskEngine: Engine = {
  name: 'risk',

  calculate(input: EngineInput): EngineOutput {
    const sorted = [...input.financials].sort((a, b) => b.fiscal_year - a.fiscal_year);
    const latest = sorted[0];
    const prior = sorted[1] || sorted[0];

    if (!latest) {
      return { score: 0, breakdown: {} };
    }

    const altmanZ = roundToDecimal(computeAltmanZ(latest), 2);
    const fScore = computeFScore(latest, prior!);
    const mScore = prior ? roundToDecimal(computeMScore(latest, prior), 2) : 0;

    const altmanScore = scoreAltman(altmanZ);
    const fScorePoints = scoreFScore(fScore);
    const mScorePoints = clamp(scoreMScore(mScore), 0, 34);

    const totalScore = clamp(altmanScore + fScorePoints + mScorePoints, 0, 100);

    return {
      score: totalScore,
      breakdown: {
        altmanZ: { value: altmanZ, score: altmanScore },
        piotroskiF: { value: fScore, score: fScorePoints },
        beneishM: { value: mScore, score: mScorePoints },
      },
    };
  },
};
