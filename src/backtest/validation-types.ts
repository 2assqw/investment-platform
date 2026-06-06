export interface BucketStats {
  bucket: string;
  count: number;
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  sharpeRatio: number;
}

export interface AlphaReport {
  generatedAt: string;
  totalSnapshots: number;
  totalTickers: number;
  overall: Record<string, BucketStats>;
}

export interface FactorValidation {
  factor: string;
  avgReturn: number;
  winRate: number;
  count: number;
}

export interface ModelHealth {
  alphaScore: number;
  validatedFactors: number;
  unvalidatedFactors: number;
  bestPredictor: string | null;
  topFactors: Array<{ factor: string; alphaScore: number }>;
}
