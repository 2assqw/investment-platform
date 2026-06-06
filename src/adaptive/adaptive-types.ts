export interface FactorWeight {
  factor_name: string;
  current_weight: number;
  previous_weight: number | null;
  alpha_score: number;
  confidence: number;
  win_rate: number;
  sharpe: number;
  updated_at: string;
}

export interface AdaptiveModel {
  weights: Record<string, number>;
  totalConfidence: number;
  regime: string;
}

export interface WeightEvolution {
  factor: string;
  previous: number;
  current: number;
  change: number;
}

export interface FactorAttribution {
  bestFactor: string | null;
  bestAlpha: number;
  worstFactor: string | null;
  worstAlpha: number;
  totalAlpha: number;
}

export interface StaticVsAdaptive {
  staticReturn: number;
  adaptiveReturn: number;
  improvement: number;
  confidence: number;
}
