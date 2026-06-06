import { FinancialRow, ValuationBenchmarkRow } from '../types';
import { NormalizationWarning } from '../normalizers/types';

export interface EngineInput {
  ticker: string;
  financials: FinancialRow[];
  benchmarks?: ValuationBenchmarkRow[];
  warnings?: NormalizationWarning[];
  marketCap?: number;
}

export interface EngineOutput {
  score: number;
  breakdown: Record<string, unknown>;
}

export interface Engine {
  readonly name: string;
  calculate(input: EngineInput): EngineOutput;
}
