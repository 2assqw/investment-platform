// ============================================================
// Database row types (internal — mirrors D1 schema exactly)
// ============================================================

export interface CompanyRow {
  ticker: string;
  cik: string;
  name: string;
  sector: string;
  industry: string;
  market_cap: number;
  updated_at: string;
}

export interface FinancialRow {
  ticker: string;
  fiscal_year: number;
  period_end_date: string;
  revenue: number;
  gross_profit: number;
  operating_income: number;
  net_income: number;
  operating_cash_flow: number;
  free_cash_flow: number;
  total_assets: number;
  total_liabilities: number;
  shareholder_equity: number;
  shares_outstanding: number;
}

export interface MetricRow {
  ticker: string;
  quality_score: number;
  growth_score: number;
  valuation_score: number;
  risk_score: number;
  overall_score: number;
  consistency_score: number;
  updated_at: string;
}

export interface MetricBreakdownRow {
  id: number;
  ticker: string;
  metric_name: string;
  metric_value: number;
  metric_score: number;
  engine: string;
  updated_at: string;
}

export interface ValuationBenchmarkRow {
  sector: string;
  benchmark_type: 'sector' | 'market';
  pe_median: number;
  pe_p75: number;
  ps_median: number;
  ps_p75: number;
  updated_at: string;
}

// ============================================================
// API response types (stable contract — do not change)
// ============================================================

export interface IndustrySupportInfo {
  level: 'PASS' | 'WARNING' | 'FAIL';
  reason: string | null;
}

export interface CompanyResponse {
  ticker: string;
  industrySupport: IndustrySupportInfo;
  warnings: string[];
  scores: {
    quality: number;
    growth: number;
    valuation: number;
    risk: number;
    overall: number;
  };
  updatedAt: string;
}

export interface BreakdownResponse {
  ticker: string;
  industrySupport: IndustrySupportInfo;
  warnings: string[];
  quality: Record<string, MetricDetail>;
  growth: Record<string, MetricDetail>;
  valuation: Record<string, MetricDetail>;
  risk: Record<string, MetricDetail>;
}

export interface MetricDetail {
  value: number;
  score: number;
}

export interface FinancialsResponse {
  ticker: string;
  financials: FinancialItem[];
}

export interface FinancialItem {
  fiscalYear: number;
  periodEndDate: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  totalAssets: number;
  totalLiabilities: number;
  shareholderEquity: number;
  sharesOutstanding: number;
}

// ============================================================
// Worker environment bindings
// ============================================================

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

// ============================================================
// Error response
// ============================================================

export interface ErrorResponse {
  error: string;
  status: number;
}
