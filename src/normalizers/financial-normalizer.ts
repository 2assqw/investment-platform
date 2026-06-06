import {
  FinancialNormalizer,
  NormalizedFinancials,
  NormalizationWarning,
} from './types';
import { safeDivide } from '../engines/scoring';
import { FinancialRow } from '../types';

const SPLIT_RATIO_HIGH = 1.5;
const SPLIT_RATIO_LOW = 0.67;

export const defaultNormalizer: FinancialNormalizer = {
  name: 'default-v1',

  normalize(financials: FinancialRow[]): NormalizedFinancials {
    if (financials.length < 2) {
      return { financials, warnings: [] };
    }

    const sorted = [...financials].sort((a, b) => a.fiscal_year - b.fiscal_year);
    const warnings: NormalizationWarning[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]!;
      const prior = sorted[i - 1]!;

      if (prior.shares_outstanding === 0 || current.shares_outstanding === 0) {
        continue;
      }

      const shareRatio = safeDivide(
        current.shares_outstanding,
        prior.shares_outstanding,
      );

      if (shareRatio > SPLIT_RATIO_HIGH || shareRatio < SPLIT_RATIO_LOW) {
        warnings.push({
          type: 'possible_stock_split_detected',
          fiscalYear: current.fiscal_year,
          ratio: Math.round(shareRatio * 10) / 10,
        });
      }
    }

    return { financials, warnings };
  },
};
