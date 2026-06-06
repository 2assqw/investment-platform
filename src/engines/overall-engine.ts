import { Engine, EngineInput, EngineOutput } from './types';
import { qualityEngine } from './quality-engine';
import { growthEngine } from './growth-engine';
import { valuationEngine } from './valuation-engine';
import { riskEngine } from './risk-engine';
import { clamp } from './scoring';

const WEIGHTS = {
  quality: 0.25,
  growth: 0.25,
  valuation: 0.30,
  risk: 0.20,
} as const;

export const overallEngine: Engine = {
  name: 'overall',

  calculate(input: EngineInput): EngineOutput {
    const quality = qualityEngine.calculate(input);
    const growth = growthEngine.calculate(input);
    const valuation = valuationEngine.calculate(input);
    const risk = riskEngine.calculate(input);

    const overall = Math.round(
      quality.score * WEIGHTS.quality +
      growth.score * WEIGHTS.growth +
      valuation.score * WEIGHTS.valuation +
      risk.score * WEIGHTS.risk,
    );

    return {
      score: clamp(overall, 0, 100),
      breakdown: {
        quality: { score: quality.score, weight: WEIGHTS.quality },
        growth: { score: growth.score, weight: WEIGHTS.growth },
        valuation: { score: valuation.score, weight: WEIGHTS.valuation },
        risk: { score: risk.score, weight: WEIGHTS.risk },
      },
    };
  },
};
