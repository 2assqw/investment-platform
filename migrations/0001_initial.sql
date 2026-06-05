-- 0001_initial.sql
-- Investment Research Platform V1

CREATE TABLE IF NOT EXISTS companies (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  market_cap REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financials (
  ticker TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  revenue REAL,
  gross_profit REAL,
  operating_income REAL,
  net_income REAL,
  operating_cash_flow REAL,
  free_cash_flow REAL,
  total_assets REAL,
  total_liabilities REAL,
  shareholder_equity REAL,
  shares_outstanding REAL,
  PRIMARY KEY (ticker, fiscal_year)
);

CREATE TABLE IF NOT EXISTS metrics (
  ticker TEXT PRIMARY KEY,
  quality_score INTEGER NOT NULL DEFAULT 0,
  growth_score INTEGER NOT NULL DEFAULT 0,
  valuation_score INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER NOT NULL DEFAULT 0,
  consistency_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metric_breakdowns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metric_score INTEGER NOT NULL DEFAULT 0,
  engine TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metric_breakdowns_ticker
  ON metric_breakdowns(ticker);

CREATE INDEX IF NOT EXISTS idx_metric_breakdowns_engine
  ON metric_breakdowns(ticker, engine);

CREATE TABLE IF NOT EXISTS valuation_benchmarks (
  sector TEXT NOT NULL,
  benchmark_type TEXT NOT NULL CHECK (benchmark_type IN ('sector', 'market')),
  pe_median REAL,
  pe_p75 REAL,
  ps_median REAL,
  ps_p75 REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sector, benchmark_type)
);
