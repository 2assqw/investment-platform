import { SupportLevel } from '../classification/types';

export interface Contribution {
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
}

export interface FactorImpact {
  score: number;
  impact: number;
  label: 'positive' | 'neutral' | 'negative';
}

export interface FactorAttribution {
  growthConsistency: FactorImpact;
  shareholderAlignment: FactorImpact;
  cashConversion: FactorImpact;
}

export interface TrustInfo {
  score: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface Explanation {
  ticker: string;
  overall: number;
  industrySupport: { level: SupportLevel; reason: string | null };
  warnings: string[];
  contributions: Contribution;
  factorContributions: FactorAttribution;
  strengths: string[];
  weaknesses: string[];
  trust: TrustInfo;
}
