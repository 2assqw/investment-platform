import { FinancialRow } from '../types';

export interface FactorInput {
  ticker: string;
  financials: FinancialRow[];
}

export interface FactorResult {
  factor: string;
  score: number;
  metrics: Record<string, number>;
  breakdown: Record<string, unknown>;
}

export interface Factor {
  readonly name: string;
  calculate(input: FactorInput): FactorResult;
}

export interface AllFactors {
  growthConsistency: FactorResult;
  shareholderAlignment: FactorResult;
  cashConversion: FactorResult;
}
