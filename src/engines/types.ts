import { FinancialRow, ValuationBenchmarkRow } from '../types';

export interface EngineInput {
  ticker: string;
  financials: FinancialRow[];
  benchmarks?: ValuationBenchmarkRow[];
}

export interface EngineOutput {
  score: number;
  breakdown: Record<string, unknown>;
}

export interface Engine {
  readonly name: string;
  calculate(input: EngineInput): EngineOutput;
}
