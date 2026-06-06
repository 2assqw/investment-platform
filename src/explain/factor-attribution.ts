import { FactorAttribution, FactorImpact } from './types';
import { roundToDecimal } from '../engines/scoring';

function classifyImpact(score: number, impact: number): FactorImpact {
  return {
    score,
    impact: roundToDecimal(impact, 1),
    label: impact > 2 ? 'positive' : impact < -2 ? 'negative' : 'neutral',
  };
}

/**
 * Determines whether each proprietary factor helped or hurt the score.
 * Impact is derived from how much the factor score deviates from neutral (50).
 * Positive deviation → positive impact, negative deviation → negative impact.
 */
export function computeFactorAttribution(factors: Record<string, { score: number }>): FactorAttribution {
  const gc = factors.growth_consistency?.score ?? 50;
  const sa = factors.shareholder_alignment?.score ?? 50;
  const cc = factors.cash_conversion?.score ?? 50;

  // Impact = (score - 50) * 0.2, scaled to -10..+10 range
  return {
    growthConsistency: classifyImpact(gc, (gc - 50) * 0.2),
    shareholderAlignment: classifyImpact(sa, (sa - 50) * 0.2),
    cashConversion: classifyImpact(cc, (cc - 50) * 0.2),
  };
}
