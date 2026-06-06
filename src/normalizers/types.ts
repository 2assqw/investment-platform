import { FinancialRow } from '../types';

export interface NormalizationWarning {
  type: 'possible_stock_split_detected';
  fiscalYear: number;
  ratio: number;
}

export interface NormalizedFinancials {
  financials: FinancialRow[];
  warnings: NormalizationWarning[];
}

export interface FinancialNormalizer {
  readonly name: string;
  normalize(financials: FinancialRow[]): NormalizedFinancials;
}
