export interface FactorRegistryEntry {
  factor_id: string;
  factor_name: string;
  category: string;
  status: 'experimental' | 'backtesting' | 'validated' | 'approved' | 'production' | 'retired';
  description: string;
  created_at: string;
}

export interface FactorResult {
  factor_id: string;
  annual_return: number;
  win_rate: number;
  sharpe: number;
  max_drawdown: number;
  information_ratio: number;
  alpha_score: number;
  period_days: number;
  created_at: string;
}

export interface FactorReport {
  factor: string;
  category: string;
  status: string;
  annualReturn: number;
  winRate: number;
  sharpe: number;
  alphaScore: number;
}

export interface FactorComparison {
  factors: FactorReport[];
  topFactor: string | null;
  averageAlpha: number;
}

export interface FactorDashboard {
  experimental: number;
  validated: number;
  production: number;
  retired: number;
  total: number;
}
