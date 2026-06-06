import { SupportLevel } from '../classification/types';
import { MetricBreakdownRow } from '../types';

export interface ScoreContext {
  ticker: string;
  quality: number;
  growth: number;
  risk: number;
  overall: number;
  industrySupport: SupportLevel;
  breakdowns: MetricBreakdownRow[];
  fiscalYears: number;
  hasSplitWarning: boolean;
}

export interface ScoreValidationResult {
  warnings: string[];
  anomalies: ScoreAnomaly[];
}

export interface ScoreAnomaly {
  type: string;
  detail: string;
}
