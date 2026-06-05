# Investment Research Platform V1 — Design Spec

**Date**: 2026-06-05
**Status**: Approved

## Constraints (Non-Negotiable)

1. Worker must NEVER compute financial metrics
2. Worker must NEVER fetch SEC data
3. Worker must NEVER call AI
4. Worker acts as a read-only JSON API

## Architecture

```
Request Flow:                 Computation Flow:
  Cache API (edge, 1h)            Cron Trigger
  ↓ miss                          ↓
  KV (24h normal / 7d hot)        Provider (SEC/FMP interface)
  ↓ miss                          ↓
  D1 (permanent)                  financials table
  ↓                               ↓
  populate KV                     Engines (pure functions)
  ↓                               ↓
  populate Cache API              metrics + metric_breakdowns tables
  ↓                               ↓
  Response                        delete KV key → delete Cache key
```

Cron on write: D1.write → KV.delete → Cache.delete. Next request rebuilds cache naturally.

## Directory Structure

```
src/
  providers/     — data fetching abstraction (SEC EDGAR, FMP, etc.)
  engines/       — pure scoring functions, no I/O
  jobs/          — cron entry points
  queue/         — reserved for future async pipeline
  api/           — Worker route handlers
  types/         — shared TypeScript types
migrations/      — D1 SQL files
```

## API (Stable Contract — do not change without versioning)

```
GET /api/company/:ticker           → { ticker, scores: { quality, growth, valuation, risk, overall }, updatedAt }
GET /api/company/:ticker/breakdown → { ticker, quality: {...}, growth: {...}, valuation: {...}, risk: {...} }
GET /api/company/:ticker/financials → { ticker, financials: [{ fiscalYear, revenue, netIncome, ... }] }
```

## Database (Internal — can evolve independently of API)

### companies
```
ticker TEXT PK | name TEXT | sector TEXT | industry TEXT | market_cap REAL | updated_at TEXT
```

### financials
```
ticker TEXT | fiscal_year INTEGER | revenue/gross_profit/operating_income/net_income/
operating_cash_flow/free_cash_flow/total_assets/total_liabilities/shareholder_equity/
shares_outstanding REAL | PK(ticker, fiscal_year)
```
Raw SEC data only. No computed values.

### metrics
```
ticker TEXT PK | quality_score/growth_score/valuation_score/risk_score/
overall_score/consistency_score INTEGER | updated_at TEXT
```
Final 0-100 scores only. For fast query/sort/filter.

### metric_breakdowns
```
id INTEGER PK AUTOINCREMENT | ticker TEXT | metric_name TEXT | metric_value REAL |
metric_score INTEGER | engine TEXT | updated_at TEXT
```
Row-per-metric detail for display. E.g., ROE=24.3% score=25, Revenue CAGR=31.2% score=33.

### valuation_benchmarks
```
sector TEXT | benchmark_type TEXT (sector|market) | pe_median REAL | pe_p75 REAL |
ps_median REAL | ps_p75 REAL | updated_at TEXT | PK(sector, benchmark_type)
```
Reference data for percentile calculations. Not per-stock results.

## Cache Strategy

| Tier | Scope | TTL |
|------|-------|-----|
| Cache API | All stocks | 1 hour |
| KV | Normal stocks | 24 hours |
| KV | Hot stocks (NVDA/AAPL/MSFT/META/AMZN/GOOGL/TSLA) | 7 days |
| D1 | All | Permanent |

Hot stock list: NVDA, AAPL, MSFT, META, AMZN, GOOGL, TSLA

## Cron Jobs

| Job | Frequency | Updates |
|-----|-----------|---------|
| update-valuation | Daily | Price data, valuation scores, benchmarks |
| update-fundamentals | Weekly | Quality, Growth, Risk scores |
| update-all | 10-Q/10-K filing trigger | Full recalculation |

## Engines (Pure Functions — no I/O, no side effects)

### Interface
```typescript
interface EngineInput {
  ticker: string;
  financials: FinancialRow[];
  benchmarks?: ValuationBenchmark[];
}

interface EngineOutput {
  score: number;  // 0-100
  breakdown: Record<string, unknown>;
}
```

### Quality Engine (0-100)
- ROE (25pts) — Net Income / Shareholder Equity
- ROIC (25pts) — Operating Income / (Total Assets - Current Liabilities)
- FCF Margin (25pts) — Free Cash Flow / Revenue
- Debt Ratio (25pts) — scoring inversely: lower debt = higher score

### Growth Engine (0-100)
- Revenue CAGR 3Y
- EPS CAGR 3Y
- FCF CAGR 3Y

### Valuation Engine (0-100)
- PE Percentile (70% sector + 30% market weight)
- PS Percentile (70% sector + 30% market weight)
- Lower percentile = cheaper = higher score

### Risk Engine (0-100)
Integrates: Altman Z-Score, Piotroski F-Score, Beneish M-Score
These components are exposed in breakdown (API) but NOT visible on homepage.

### Overall Engine (0-100)
- Quality 30% × Growth 30% × Valuation 20% × Risk 20%

## Frontend Display Rules

**Homepage (visible)**: Quality, Growth, Valuation, Risk, Overall scores
**Advanced section (hidden by default)**: Altman Z, F-Score, Beneish M components
