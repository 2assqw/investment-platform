import { Contribution } from './types';
import { roundToDecimal } from '../engines/scoring';

const WEIGHTS = {
  quality: 0.25,
  growth: 0.25,
  valuation: 0.30,
  risk: 0.20,
};

/**
 * Converts raw engine scores into weighted contribution points.
 * Each contribution = score × weight.
 */
export function computeContributions(scores: {
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
}): Contribution {
  return {
    quality: roundToDecimal(scores.quality * WEIGHTS.quality, 1),
    growth: roundToDecimal(scores.growth * WEIGHTS.growth, 1),
    valuation: roundToDecimal(scores.valuation * WEIGHTS.valuation, 1),
    risk: roundToDecimal(scores.risk * WEIGHTS.risk, 1),
  };
}
