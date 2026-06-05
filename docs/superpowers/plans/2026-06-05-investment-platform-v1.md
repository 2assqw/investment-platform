# Investment Research Platform V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Workers investment research platform where all computation runs in cron jobs, Workers serve only cached/precomputed results.

**Architecture:** Worker is read-only JSON API (Cache API → KV → D1). Cron jobs run engines (pure functions) and write results to D1, then invalidate cache keys. Engines never do I/O.

**Tech Stack:** Cloudflare Pages, Cloudflare Workers, D1, KV, Cron Triggers, TypeScript

**File Structure:**
```
investment-platform/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── migrations/
│   └── 0001_initial.sql
├── src/
│   ├── index.ts                    # Worker entry point (router)
│   ├── types/
│   │   └── index.ts                # All shared types + API response types
│   ├── engines/
│   │   ├── types.ts                # Engine interface
│   │   ├── scoring.ts              # Shared scoring helpers
│   │   ├── quality-engine.ts
│   │   ├── growth-engine.ts
│   │   ├── valuation-engine.ts
│   │   ├── risk-engine.ts
│   │   ├── overall-engine.ts
│   │   └── index.ts                # Barrel export
│   ├── providers/
│   │   ├── types.ts                # DataProvider interface
│   │   ├── sec-edgar.ts            # SEC EDGAR provider stub (swappable)
│   │   └── index.ts
│   ├── api/
│   │   ├── company.ts              # GET /api/company/:ticker
│   │   ├── breakdown.ts            # GET /api/company/:ticker/breakdown
│   │   ├── financials.ts           # GET /api/company/:ticker/financials
│   │   └── index.ts
│   ├── jobs/
│   │   ├── update-valuation.ts     # Daily: prices, valuation, benchmarks
│   │   ├── update-fundamentals.ts  # Weekly: quality, growth, risk
│   │   └── update-all.ts           # Filing trigger: full recalculation
│   ├── cache/
│   │   └── index.ts                # Cache API + KV helpers
│   ├── db/
│   │   └── index.ts                # D1 query helpers
│   └── queue/
│       └── .gitkeep                # Reserved for future async pipeline
└── test/
    ├── engines/
    │   ├── quality.test.ts
    │   ├── growth.test.ts
    │   ├── valuation.test.ts
    │   ├── risk.test.ts
    │   └── overall.test.ts
    └── api/
        └── routes.test.ts
```

---

## Phase 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `investment-platform/package.json`
- Create: `investment-platform/tsconfig.json`
- Create: `investment-platform/wrangler.toml`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "investment-platform",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "d1:migrate:local": "wrangler d1 execute investment-db --local --file=./migrations/0001_initial.sql",
    "d1:migrate:remote": "wrangler d1 execute investment-db --file=./migrations/0001_initial.sql",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250504.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create wrangler.toml**

```toml
name = "investment-platform"
main = "src/index.ts"
compatibility_date = "2025-05-04"

[[d1_databases]]
binding = "DB"
database_name = "investment-db"
database_id = ""

[[kv_namespaces]]
binding = "KV"
id = ""

[triggers]
crons = ["0 22 * * *"]  # Daily valuation at 10 PM UTC

[env.production]
[env.production.triggers]
crons = [
  "0 22 * * *",     # Daily valuation
  "0 0 * * 0",      # Weekly fundamentals (Sunday midnight)
]
```

---

### Task 2: D1 Migration

**Files:**
- Create: `investment-platform/migrations/0001_initial.sql`

- [ ] **Step 1: Write migration SQL**

```sql
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

CREATE INDEX IF NOT EXISTS idx_metric_breakdowns_ticker ON metric_breakdowns(ticker);
CREATE INDEX IF NOT EXISTS idx_metric_breakdowns_engine ON metric_breakdowns(ticker, engine);

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
```

---

### Task 3: Shared Types

**Files:**
- Create: `investment-platform/src/types/index.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// === Database row types (internal) ===

export interface CompanyRow {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  market_cap: number;
  updated_at: string;
}

export interface FinancialRow {
  ticker: string;
  fiscal_year: number;
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

// === API response types (stable contract — do not change) ===

export interface CompanyResponse {
  ticker: string;
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

// === Error response ===

export interface ErrorResponse {
  error: string;
  status: number;
}
```

---

## Phase 2: Engines

### Task 4: Engine Interface + Scoring Helpers

**Files:**
- Create: `investment-platform/src/engines/types.ts`
- Create: `investment-platform/src/engines/scoring.ts`

- [ ] **Step 1: Write engine interface**

```typescript
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
```

- [ ] **Step 2: Write scoring helpers**

```typescript
// Shared thresholds → score mapping

export function linearScore(value: number, thresholds: number[]): number {
  // thresholds: [max, step1, step2, ...] scoring max down to 0
  // e.g., [25, 30, 20, 15, 10, 5] means: >30→25, >20→20, >15→15, >10→10, >5→5, else→0
  const maxScore = thresholds[0]!;
  for (let i = 1; i < thresholds.length; i++) {
    if (value >= thresholds[i]!) {
      return maxScore - (i - 1) * (maxScore / (thresholds.length - 1));
    }
  }
  return 0;
}

export function inverseLinearScore(value: number, thresholds: number[], maxScore: number): number {
  // For metrics where lower is better (e.g., debt ratio)
  for (let i = 1; i < thresholds.length; i++) {
    if (value <= thresholds[i]!) {
      return maxScore - (i - 1) * (maxScore / (thresholds.length - 1));
    }
  }
  return 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundToDecimal(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function cagr(start: number, end: number, years: number): number {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return Math.pow(end / start, 1 / years) - 1;
}
```

---

### Task 5: Quality Engine

**Files:**
- Create: `investment-platform/src/engines/quality-engine.ts`

- [ ] **Step 1: Write Quality Engine**

```typescript
import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal } from './scoring';
import { FinancialRow } from '../types';

const ROE_THRESHOLDS = [25, 30, 20, 15, 10, 5];       // max 25pts
const ROIC_THRESHOLDS = [25, 20, 15, 10, 5, 2];        // max 25pts
const FCF_MARGIN_THRESHOLDS = [25, 25, 20, 15, 10, 5]; // max 25pts
const DEBT_THRESHOLDS = [25, 20, 40, 60, 80, 100];     // max 25pts, lower is better

function scoreMetric(value: number, thresholds: number[]): number {
  const maxScore = thresholds[0]!;
  for (let i = 1; i < thresholds.length; i++) {
    if (value >= thresholds[i]!) {
      const stepSize = maxScore / (thresholds.length - 1);
      return Math.round(maxScore - (i - 1) * stepSize);
    }
  }
  return 0;
}

function scoreDebt(debtRatio: number): number {
  // Lower debt = higher score
  for (let i = 1; i < DEBT_THRESHOLDS.length; i++) {
    if (debtRatio * 100 <= DEBT_THRESHOLDS[i]!) {
      const stepSize = 25 / (DEBT_THRESHOLDS.length - 1);
      return Math.round(25 - (i - 1) * stepSize);
    }
  }
  return 0;
}

function safeDivide(a: number, b: number): number {
  return b !== 0 ? a / b : 0;
}

export const qualityEngine: Engine = {
  name: 'quality',

  calculate(input: EngineInput): EngineOutput {
    const latest = input.financials[input.financials.length - 1];
    if (!latest) {
      return { score: 0, breakdown: {} };
    }

    const roe = roundToDecimal(safeDivide(latest.net_income, latest.shareholder_equity) * 100, 1);
    const roic = roundToDecimal(safeDivide(latest.operating_income, latest.total_assets) * 100, 1);
    const fcfMargin = roundToDecimal(safeDivide(latest.free_cash_flow, latest.revenue) * 100, 1);
    const debtRatio = roundToDecimal(safeDivide(latest.total_liabilities, latest.total_assets), 2);

    const roeScore = scoreMetric(roe, ROE_THRESHOLDS);
    const roicScore = scoreMetric(roic, ROIC_THRESHOLDS);
    const fcfScore = scoreMetric(fcfMargin, FCF_MARGIN_THRESHOLDS);
    const debtScore = scoreDebt(debtRatio);

    const totalScore = clamp(roeScore + roicScore + fcfScore + debtScore, 0, 100);

    return {
      score: totalScore,
      breakdown: {
        roe: { value: roe, score: roeScore },
        roic: { value: roic, score: roicScore },
        fcfMargin: { value: fcfMargin, score: fcfScore },
        debtRatio: { value: roundToDecimal(debtRatio * 100, 1), score: debtScore },
      },
    };
  },
};
```

---

### Task 6: Growth Engine

**Files:**
- Create: `investment-platform/src/engines/growth-engine.ts`

- [ ] **Step 1: Write Growth Engine**

```typescript
import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal, cagr } from './scoring';
import { FinancialRow } from '../types';

const CAGR_THRESHOLDS = [33, 30, 20, 15, 10, 5, 0]; // max 33pts each, capped at 100 total

function scoreCagr(value: number): number {
  const thresholds = CAGR_THRESHOLDS;
  const maxScore = thresholds[0]!;
  for (let i = 1; i < thresholds.length; i++) {
    if (value * 100 >= thresholds[i]!) {
      const stepSize = maxScore / (thresholds.length - 1);
      return Math.round(maxScore - (i - 1) * stepSize);
    }
  }
  return 0;
}

function safeDivide(a: number, b: number): number {
  return b !== 0 ? a / b : 0;
}

export const growthEngine: Engine = {
  name: 'growth',

  calculate(input: EngineInput): EngineOutput {
    const sorted = [...input.financials].sort((a, b) => b.fiscal_year - a.fiscal_year);
    if (sorted.length < 3) {
      return { score: 0, breakdown: { error: 'insufficient data, need 3+ years' } };
    }

    const latest = sorted[0]!;
    const threeYearsAgo = sorted[2]!;

    const revenueCagr = roundToDecimal(cagr(threeYearsAgo.revenue, latest.revenue, 3), 3);
    const epsCagr = roundToDecimal(
      cagr(
        safeDivide(threeYearsAgo.net_income, threeYearsAgo.shares_outstanding),
        safeDivide(latest.net_income, latest.shares_outstanding),
        3
      ),
      3
    );
    const fcfCagr = roundToDecimal(cagr(threeYearsAgo.free_cash_flow, latest.free_cash_flow, 3), 3);

    const revenueScore = scoreCagr(revenueCagr);
    const epsScore = scoreCagr(epsCagr);
    const fcfScore = scoreCagr(fcfCagr);

    const totalScore = clamp(revenueScore + epsScore + fcfScore, 0, 100);

    return {
      score: totalScore,
      breakdown: {
        revenueCagr: { value: roundToDecimal(revenueCagr * 100, 1), score: revenueScore },
        epsCagr: { value: roundToDecimal(epsCagr * 100, 1), score: epsScore },
        fcfCagr: { value: roundToDecimal(fcfCagr * 100, 1), score: fcfScore },
      },
    };
  },
};
```

---

### Task 7: Valuation Engine

**Files:**
- Create: `investment-platform/src/engines/valuation-engine.ts`

- [ ] **Step 1: Write Valuation Engine**

Uses PE/PS percentile. 70% sector + 30% market weight. Lower percentile = cheaper = higher score.

```typescript
import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal } from './scoring';
import { ValuationBenchmarkRow, FinancialRow } from '../types';

function safeDivide(a: number, b: number): number {
  return b !== 0 ? a / b : 0;
}

function percentileToScore(percentile: number): number {
  // Lower percentile = cheaper = higher score
  if (percentile <= 10) return 100;
  if (percentile <= 25) return 75;
  if (percentile <= 50) return 50;
  if (percentile <= 75) return 25;
  return 0;
}

function computePercentile(value: number, median: number, p75: number): number {
  // Linear interpolation: median → 50th, p75 → 75th
  if (value <= median) {
    if (median <= 0) return 50;
    return Math.max(1, (value / median) * 50);
  }
  if (p75 <= median) return 75;
  return Math.min(99, 50 + ((value - median) / (p75 - median)) * 25);
}

export const valuationEngine: Engine = {
  name: 'valuation',

  calculate(input: EngineInput): EngineOutput {
    const latest = input.financials[input.financials.length - 1];
    if (!latest || !input.benchmarks) {
      return { score: 0, breakdown: {} };
    }

    // Compute PE and PS
    const eps = safeDivide(latest.net_income, latest.shares_outstanding);
    // We don't have price in financial data. PE/PS require market price.
    // In practice, price is passed through EngineInput or fetched separately.
    // For cron calculation, price comes from the valuation job.
    
    // Placeholder: score will be computed by the cron job which has price data.
    // The engine returns the raw values; the cron applies benchmarks.
    
    const sectorBench = input.benchmarks.find(b => b.benchmark_type === 'sector');
    const marketBench = input.benchmarks.find(b => b.benchmark_type === 'market');

    // PE and PS require price. This engine is called by the cron job
    // which enriches EngineInput with computed PE/PS before calling.
    // For pure function signature, we accept a special valuation input.
    
    return {
      score: 0,
      breakdown: {
        note: 'Valuation scores are computed by the cron job with live price data',
      },
    };
  },
};

// Helper used by cron job directly:
export function computeValuationScore(
  pe: number,
  ps: number,
  sectorBench: ValuationBenchmarkRow,
  marketBench: ValuationBenchmarkRow
): { score: number; breakdown: Record<string, unknown> } {
  const peSectorPct = computePercentile(pe, sectorBench.pe_median, sectorBench.pe_p75);
  const peMarketPct = computePercentile(pe, marketBench.pe_median, marketBench.pe_p75);
  const psSectorPct = computePercentile(ps, sectorBench.ps_median, sectorBench.ps_p75);
  const psMarketPct = computePercentile(ps, marketBench.ps_median, marketBench.ps_p75);

  // 70% sector + 30% market
  const peWeighted = peSectorPct * 0.7 + peMarketPct * 0.3;
  const psWeighted = psSectorPct * 0.7 + psMarketPct * 0.3;

  const peScore = percentileToScore(peWeighted);
  const psScore = percentileToScore(psWeighted);

  // Equal weight PE and PS
  const totalScore = clamp(Math.round(peScore * 0.5 + psScore * 0.5), 0, 100);

  return {
    score: totalScore,
    breakdown: {
      pe: {
        value: roundToDecimal(pe, 1),
        sectorPercentile: roundToDecimal(peSectorPct, 1),
        marketPercentile: roundToDecimal(peMarketPct, 1),
        weightedPercentile: roundToDecimal(peWeighted, 1),
        score: peScore,
      },
      ps: {
        value: roundToDecimal(ps, 1),
        sectorPercentile: roundToDecimal(psSectorPct, 1),
        marketPercentile: roundToDecimal(psMarketPct, 1),
        weightedPercentile: roundToDecimal(psWeighted, 1),
        score: psScore,
      },
    },
  };
}
```

---

### Task 8: Risk Engine

**Files:**
- Create: `investment-platform/src/engines/risk-engine.ts`

- [ ] **Step 1: Write Risk Engine**

Integrates Altman Z-Score, Piotroski F-Score (0-9), Beneish M-Score. Converts each to 0-33 range.

```typescript
import { Engine, EngineInput, EngineOutput } from './types';
import { clamp, roundToDecimal } from './scoring';
import { FinancialRow } from '../types';

function safeDivide(a: number, b: number): number {
  return b !== 0 ? a / b : 0;
}

// === Altman Z-Score (simplified) ===
function computeAltmanZ(f: FinancialRow): number {
  const x1 = safeDivide(f.shareholder_equity, f.total_assets);
  const x3 = safeDivide(f.operating_income, f.total_assets);
  const x5 = safeDivide(f.revenue, f.total_assets);
  return 1.2 * x1 + 3.3 * x3 + 1.0 * x5;
}

function scoreAltman(z: number): number {
  if (z > 3.0) return 33;
  if (z > 2.0) return 25;
  if (z > 1.0) return 17;
  if (z > 0) return 8;
  return 0;
}

// === Piotroski F-Score (0-9) ===
function computeFScore(current: FinancialRow, prior: FinancialRow): number {
  let score = 0;

  // 1. Positive net income
  if (current.net_income > 0) score++;

  // 2. Positive operating cash flow
  if (current.operating_cash_flow > 0) score++;

  // 3. ROA increasing
  const currentRoa = safeDivide(current.net_income, current.total_assets);
  const priorRoa = safeDivide(prior.net_income, prior.total_assets);
  if (currentRoa > priorRoa) score++;

  // 4. Operating cash flow > net income
  if (current.operating_cash_flow > current.net_income) score++;

  // 5. Debt ratio decreasing
  const currentDebt = safeDivide(current.total_liabilities, current.total_assets);
  const priorDebt = safeDivide(prior.total_liabilities, prior.total_assets);
  if (currentDebt < priorDebt) score++;

  // 6. Current ratio increasing — skip (no current assets data)

  // 7. No dilution
  if (current.shares_outstanding <= prior.shares_outstanding) score++;

  // 8. Gross margin increasing
  const currentGm = safeDivide(current.gross_profit, current.revenue);
  const priorGm = safeDivide(prior.gross_profit, prior.revenue);
  if (currentGm > priorGm) score++;

  // 9. Asset turnover increasing
  const currentTurn = safeDivide(current.revenue, current.total_assets);
  const priorTurn = safeDivide(prior.revenue, prior.total_assets);
  if (currentTurn > priorTurn) score++;

  return score;
}

function scoreFScore(f: number): number {
  // 0-9 → 0-33
  return Math.round((f / 9) * 33);
}

// === Beneish M-Score (simplified 4-variable) ===
function computeMScore(current: FinancialRow, prior: FinancialRow): number {
  const gmi = safeDivide(
    safeDivide(prior.gross_profit, prior.revenue),
    safeDivide(current.gross_profit, current.revenue)
  );
  const sgi = safeDivide(current.revenue, prior.revenue);
  const lvgi = safeDivide(
    safeDivide(current.total_liabilities, current.total_assets),
    safeDivide(prior.total_liabilities, prior.total_assets)
  );
  const tata = safeDivide(current.net_income - current.operating_cash_flow, current.total_assets);

  return -4.84 + 0.528 * gmi + 0.892 * sgi - 0.327 * lvgi + 4.679 * tata;
}

function scoreMScore(m: number): number {
  // M < -2.22 = safe (high score), M > -1.78 = manipulator (low score)
  if (m < -2.22) return 34;
  if (m > -1.78) return 0;
  // Linear interpolation between
  return Math.round(34 * ((-1.78 - m) / 0.44));
}

export const riskEngine: Engine = {
  name: 'risk',

  calculate(input: EngineInput): EngineOutput {
    const sorted = [...input.financials].sort((a, b) => b.fiscal_year - a.fiscal_year);
    const latest = sorted[0];
    const prior = sorted[1];

    if (!latest) {
      return { score: 0, breakdown: {} };
    }

    const altmanZ = roundToDecimal(computeAltmanZ(latest), 2);
    const fScore = prior ? computeFScore(latest, prior) : computeFScore(latest, latest);
    const mScore = prior ? roundToDecimal(computeMScore(latest, prior), 2) : 0;

    const altmanScore = scoreAltman(altmanZ);
    const fScorePoints = scoreFScore(fScore);
    const mScorePoints = clamp(scoreMScore(mScore), 0, 34);

    const totalScore = clamp(altmanScore + fScorePoints + mScorePoints, 0, 100);

    return {
      score: totalScore,
      breakdown: {
        altmanZ: { value: altmanZ, score: altmanScore },
        piotroskiF: { value: fScore, score: fScorePoints },
        beneishM: { value: mScore, score: mScorePoints },
      },
    };
  },
};
```

---

### Task 9: Overall Engine

**Files:**
- Create: `investment-platform/src/engines/overall-engine.ts`

- [ ] **Step 1: Write Overall Engine**

Weighted: Quality 30%, Growth 30%, Valuation 20%, Risk 20%.

```typescript
import { Engine, EngineInput, EngineOutput } from './types';
import { qualityEngine } from './quality-engine';
import { growthEngine } from './growth-engine';
import { valuationEngine } from './valuation-engine';
import { riskEngine } from './risk-engine';
import { clamp } from './scoring';

export const overallEngine: Engine = {
  name: 'overall',

  calculate(input: EngineInput): EngineOutput {
    const quality = qualityEngine.calculate(input);
    const growth = growthEngine.calculate(input);
    const valuation = valuationEngine.calculate(input);
    const risk = riskEngine.calculate(input);

    const overall = Math.round(
      quality.score * 0.30 +
      growth.score * 0.30 +
      valuation.score * 0.20 +
      risk.score * 0.20
    );

    return {
      score: clamp(overall, 0, 100),
      breakdown: {
        quality: { score: quality.score, weight: 0.30 },
        growth: { score: growth.score, weight: 0.30 },
        valuation: { score: valuation.score, weight: 0.20 },
        risk: { score: risk.score, weight: 0.20 },
      },
    };
  },
};
```

---

### Task 10: Engine Barrel Export

**Files:**
- Create: `investment-platform/src/engines/index.ts`

- [ ] **Step 1: Write barrel export**

```typescript
export { Engine, EngineInput, EngineOutput } from './types';
export { qualityEngine } from './quality-engine';
export { growthEngine } from './growth-engine';
export { valuationEngine, computeValuationScore } from './valuation-engine';
export { riskEngine } from './risk-engine';
export { overallEngine } from './overall-engine';
```

---

## Phase 3: Infrastructure

### Task 11: Provider Interface

**Files:**
- Create: `investment-platform/src/providers/types.ts`
- Create: `investment-platform/src/providers/sec-edgar.ts`
- Create: `investment-platform/src/providers/index.ts`

- [ ] **Step 1: Write provider interface**

```typescript
import { FinancialRow } from '../types';

export interface FetchFinancialsRequest {
  ticker: string;
  fiscalYear?: number; // undefined = all available
}

export interface FetchPriceRequest {
  ticker: string;
}

export interface PriceData {
  ticker: string;
  price: number;
  marketCap: number;
}

export interface DataProvider {
  readonly name: string;
  fetchFinancials(req: FetchFinancialsRequest): Promise<FinancialRow[]>;
  fetchPrice(req: FetchPriceRequest): Promise<PriceData>;
  fetchAllTickers(): Promise<string[]>;
}
```

- [ ] **Step 2: Write SEC EDGAR provider stub**

```typescript
import { DataProvider, FetchFinancialsRequest, FetchPriceRequest, PriceData } from './types';
import { FinancialRow } from '../types';

// Stub implementation — swap with real SEC EDGAR XBRL parser or third-party API
export const secEdgarProvider: DataProvider = {
  name: 'sec-edgar',

  async fetchFinancials(req: FetchFinancialsRequest): Promise<FinancialRow[]> {
    // TODO: Implement SEC EDGAR API integration
    // 1. GET https://efts.sec.gov/LATEST/search-index?q={ticker}&forms=10-K,10-Q
    // 2. Parse XBRL/JSON facts for financial statements
    // 3. Map to FinancialRow
    throw new Error('SEC EDGAR provider not yet implemented. Swap with FMP/Polygon provider.');
  },

  async fetchPrice(req: FetchPriceRequest): Promise<PriceData> {
    throw new Error('SEC EDGAR provider does not support price data. Use a market data provider.');
  },

  async fetchAllTickers(): Promise<string[]> {
    throw new Error('Not implemented');
  },
};
```

- [ ] **Step 3: Write provider barrel export**

```typescript
export { DataProvider, FetchFinancialsRequest, FetchPriceRequest, PriceData } from './types';
export { secEdgarProvider } from './sec-edgar';
```

---

### Task 12: Cache Layer

**Files:**
- Create: `investment-platform/src/cache/index.ts`

- [ ] **Step 1: Write cache helpers**

Three-tier cache: Cache API (1h, bound to request URL), KV (24h/7d, keyed by `v1:type:ticker`), D1 (permanent).
Cache API invalidation is NOT needed — 1h TTL auto-expires. Cron only invalidates KV keys.

```typescript
const HOT_TICKERS = new Set([
  'NVDA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'TSLA',
]);

const KV_NORMAL_TTL = 86400;       // 24 hours normal
const KV_HOT_TTL = 604800;         // 7 days hot stocks

export function isHotTicker(ticker: string): boolean {
  return HOT_TICKERS.has(ticker.toUpperCase());
}

export function kvTtl(ticker: string): number {
  return isHotTicker(ticker) ? KV_HOT_TTL : KV_NORMAL_TTL;
}

export function cacheKey(ticker: string, type: string): string {
  return `v1:${type}:${ticker.toUpperCase()}`;
}

// Three-tier read-through: Cache API → KV → D1
// Cache API is bound to the incoming request URL (standard edge caching, 1h implicit)
// KV uses our explicit keys with configurable TTL
export async function getCached(
  request: Request,
  kv: KVNamespace,
  key: string,
  ttl: number,
  fetcher: () => Promise<Response>,
): Promise<Response> {
  // 1. Cache API (edge cache, bound to request URL)
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  // 2. KV (regional cache, keyed by v1:type:ticker)
  const kvData = await kv.get(key, 'json');
  if (kvData) {
    const res = Response.json(kvData);
    // Populate Cache API for next edge hit
    ctx?.waitUntil(cache.put(request, res.clone()));
    return res;
  }

  // 3. D1 (source of truth, via fetcher callback)
  const res = await fetcher();
  const data = await res.clone().json();

  // Populate KV + Cache API in background
  ctx?.waitUntil(kv.put(key, JSON.stringify(data), { expirationTtl: ttl }));
  ctx?.waitUntil(cache.put(request, Response.json(data)));

  return res;
}

// Wrapper that passes ctx for background cache writes
export async function getCachedResponse(
  request: Request,
  kv: KVNamespace,
  ticker: string,
  type: string,
  fetcher: () => Promise<Response>,
): Promise<Response> {
  const key = cacheKey(ticker, type);
  const ttl = kvTtl(ticker);
  return getCached(request, kv, key, ttl, fetcher);
}

// Called by cron after D1 writes. Only invalidates KV — Cache API auto-expires within 1h.
export async function invalidateCache(
  ticker: string,
  kv: KVNamespace,
): Promise<void> {
  const types = ['company', 'breakdown', 'financials'];
  await Promise.all(types.map(type => kv.delete(cacheKey(ticker, type))));
}
```

Note: `ctx` (ExecutionContext) must be passed through from the Worker's `fetch` handler. The API route handlers will accept `ctx` as a parameter. Update the Worker entry point in Task 16 accordingly.

---

### Task 13: DB Helpers

**Files:**
- Create: `investment-platform/src/db/index.ts`

- [ ] **Step 1: Write D1 query helpers**

```typescript
import { CompanyRow, FinancialRow, MetricRow, MetricBreakdownRow, ValuationBenchmarkRow } from '../types';

export async function getCompany(db: D1Database, ticker: string): Promise<CompanyRow | null> {
  return db.prepare('SELECT * FROM companies WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<CompanyRow>();
}

export async function getMetrics(db: D1Database, ticker: string): Promise<MetricRow | null> {
  return db.prepare('SELECT * FROM metrics WHERE ticker = ?')
    .bind(ticker.toUpperCase())
    .first<MetricRow>();
}

export async function getMetricBreakdowns(db: D1Database, ticker: string): Promise<MetricBreakdownRow[]> {
  const result = await db.prepare(
    'SELECT * FROM metric_breakdowns WHERE ticker = ? ORDER BY engine, metric_name'
  ).bind(ticker.toUpperCase()).all<MetricBreakdownRow>();
  return result.results;
}

export async function getFinancials(
  db: D1Database,
  ticker: string,
  fiscalYear?: number,
): Promise<FinancialRow[]> {
  if (fiscalYear) {
    const result = await db.prepare(
      'SELECT * FROM financials WHERE ticker = ? AND fiscal_year = ? ORDER BY fiscal_year DESC'
    ).bind(ticker.toUpperCase(), fiscalYear).all<FinancialRow>();
    return result.results;
  }
  const result = await db.prepare(
    'SELECT * FROM financials WHERE ticker = ? ORDER BY fiscal_year DESC'
  ).bind(ticker.toUpperCase()).all<FinancialRow>();
  return result.results;
}

export async function upsertMetrics(db: D1Database, row: MetricRow): Promise<void> {
  await db.prepare(`
    INSERT INTO metrics (ticker, quality_score, growth_score, valuation_score, risk_score, overall_score, consistency_score, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ticker) DO UPDATE SET
      quality_score = excluded.quality_score,
      growth_score = excluded.growth_score,
      valuation_score = excluded.valuation_score,
      risk_score = excluded.risk_score,
      overall_score = excluded.overall_score,
      consistency_score = excluded.consistency_score,
      updated_at = excluded.updated_at
  `).bind(
    row.ticker, row.quality_score, row.growth_score, row.valuation_score,
    row.risk_score, row.overall_score, row.consistency_score,
  ).run();
}

export async function replaceMetricBreakdowns(
  db: D1Database,
  ticker: string,
  engine: string,
  breakdowns: Array<{ name: string; value: number; score: number }>,
): Promise<void> {
  // Delete existing breakdowns for this ticker+engine
  await db.prepare('DELETE FROM metric_breakdowns WHERE ticker = ? AND engine = ?')
    .bind(ticker, engine).run();

  // Insert new rows
  const stmt = db.prepare(
    'INSERT INTO metric_breakdowns (ticker, metric_name, metric_value, metric_score, engine, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  );
  const batch = breakdowns.map(b => stmt.bind(ticker, b.name, b.value, b.score, engine));
  await db.batch(batch);
}

export async function getValuationBenchmarks(
  db: D1Database,
  sector: string,
): Promise<ValuationBenchmarkRow[]> {
  const result = await db.prepare(
    'SELECT * FROM valuation_benchmarks WHERE sector = ?'
  ).bind(sector).all<ValuationBenchmarkRow>();
  return result.results;
}

export async function upsertValuationBenchmark(
  db: D1Database,
  row: ValuationBenchmarkRow,
): Promise<void> {
  await db.prepare(`
    INSERT INTO valuation_benchmarks (sector, benchmark_type, pe_median, pe_p75, ps_median, ps_p75, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(sector, benchmark_type) DO UPDATE SET
      pe_median = excluded.pe_median,
      pe_p75 = excluded.pe_p75,
      ps_median = excluded.ps_median,
      ps_p75 = excluded.ps_p75,
      updated_at = excluded.updated_at
  `).bind(row.sector, row.benchmark_type, row.pe_median, row.pe_p75, row.ps_median, row.ps_p75).run();
}

export async function upsertFinancials(
  db: D1Database,
  financials: FinancialRow[],
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO financials (ticker, fiscal_year, revenue, gross_profit, operating_income, net_income, operating_cash_flow, free_cash_flow, total_assets, total_liabilities, shareholder_equity, shares_outstanding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker, fiscal_year) DO UPDATE SET
      revenue = excluded.revenue,
      gross_profit = excluded.gross_profit,
      operating_income = excluded.operating_income,
      net_income = excluded.net_income,
      operating_cash_flow = excluded.operating_cash_flow,
      free_cash_flow = excluded.free_cash_flow,
      total_assets = excluded.total_assets,
      total_liabilities = excluded.total_liabilities,
      shareholder_equity = excluded.shareholder_equity,
      shares_outstanding = excluded.shares_outstanding
  `);
  const batch = financials.map(f => stmt.bind(
    f.ticker, f.fiscal_year, f.revenue, f.gross_profit, f.operating_income,
    f.net_income, f.operating_cash_flow, f.free_cash_flow, f.total_assets,
    f.total_liabilities, f.shareholder_equity, f.shares_outstanding,
  ));
  await db.batch(batch);
}
```

---

## Phase 4: API Routes

### Task 14: Company API

**Files:**
- Create: `investment-platform/src/api/company.ts`
- Create: `investment-platform/src/api/breakdown.ts`
- Create: `investment-platform/src/api/financials.ts`
- Create: `investment-platform/src/api/index.ts`

- [ ] **Step 1: Write GET /api/company/:ticker**

```typescript
import { getCacheWithKey, cacheKey, kvTtl } from '../cache';
import { getMetrics } from '../db';
import { CompanyResponse, ErrorResponse } from '../types';

export async function handleCompany(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const key = cacheKey(ticker, 'company');
  const ttl = kvTtl(ticker);

  return getCacheWithKey(request, env.KV, key, ttl, async () => {
    const metrics = await getMetrics(env.DB, ticker);
    if (!metrics) {
      const body: ErrorResponse = { error: `Ticker ${ticker} not found`, status: 404 };
      return Response.json(body, { status: 404 });
    }

    const body: CompanyResponse = {
      ticker: metrics.ticker,
      scores: {
        quality: metrics.quality_score,
        growth: metrics.growth_score,
        valuation: metrics.valuation_score,
        risk: metrics.risk_score,
        overall: metrics.overall_score,
      },
      updatedAt: metrics.updated_at,
    };

    return Response.json(body);
  });
}
```

Note: `getCacheWithKey` is a variant of `getWithCache` that takes a key string instead of Request URL. The cache layer in Task 12 should expose both variants. The `getWithCache` implementation uses `caches.default.match(request)` which binds cache key to the full URL — which is correct for Cache API (edge caching by URL). KV uses the `cacheKey()` string key.

- [ ] **Step 2: Write GET /api/company/:ticker/breakdown**

```typescript
import { getMetricBreakdowns } from '../db';
import { BreakdownResponse, MetricBreakdownRow, ErrorResponse } from '../types';
import { cacheKey, getFromKVOrDB } from '../cache';

export async function handleBreakdown(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const key = cacheKey(ticker, 'breakdown');
  const ttl = kvTtl(ticker);

  return getFromKVOrDB(request, env.KV, key, ttl, async () => {
    const rows = await getMetricBreakdowns(env.DB, ticker);
    if (rows.length === 0) {
      return Response.json({ error: `No breakdown for ${ticker}`, status: 404 } as ErrorResponse, { status: 404 });
    }

    const grouped: Record<string, Record<string, { value: number; score: number }>> = {};
    for (const row of rows) {
      if (!grouped[row.engine]) grouped[row.engine] = {};
      grouped[row.engine]![row.metric_name] = { value: row.metric_value, score: row.metric_score };
    }

    const body: BreakdownResponse = {
      ticker: ticker.toUpperCase(),
      quality: grouped['quality'] || {},
      growth: grouped['growth'] || {},
      valuation: grouped['valuation'] || {},
      risk: grouped['risk'] || {},
    };

    return Response.json(body);
  });
}
```

- [ ] **Step 3: Write GET /api/company/:ticker/financials**

```typescript
import { getFinancials } from '../db';
import { FinancialsResponse, FinancialItem, ErrorResponse } from '../types';
import { cacheKey, getFromKVOrDB } from '../cache';

export async function handleFinancials(
  request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const key = cacheKey(ticker, 'financials');
  const ttl = kvTtl(ticker);

  return getFromKVOrDB(request, env.KV, key, ttl, async () => {
    const rows = await getFinancials(env.DB, ticker);
    if (rows.length === 0) {
      return Response.json({ error: `No financials for ${ticker}`, status: 404 } as ErrorResponse, { status: 404 });
    }

    const items: FinancialItem[] = rows.map(r => ({
      fiscalYear: r.fiscal_year,
      revenue: r.revenue,
      grossProfit: r.gross_profit,
      operatingIncome: r.operating_income,
      netIncome: r.net_income,
      operatingCashFlow: r.operating_cash_flow,
      freeCashFlow: r.free_cash_flow,
      totalAssets: r.total_assets,
      totalLiabilities: r.total_liabilities,
      shareholderEquity: r.shareholder_equity,
      sharesOutstanding: r.shares_outstanding,
    }));

    const body: FinancialsResponse = { ticker: ticker.toUpperCase(), financials: items };
    return Response.json(body);
  });
}
```

- [ ] **Step 4: Write API barrel export**

```typescript
export { handleCompany } from './company';
export { handleBreakdown } from './breakdown';
export { handleFinancials } from './financials';
```

---

## Phase 5: Cron Jobs

### Task 15: Cron Jobs

**Files:**
- Create: `investment-platform/src/jobs/update-valuation.ts`
- Create: `investment-platform/src/jobs/update-fundamentals.ts`
- Create: `investment-platform/src/jobs/update-all.ts`

- [ ] **Step 1: Write daily valuation job**

```typescript
import { computeValuationScore } from '../engines/valuation-engine';
import { getFinancials, getValuationBenchmarks, upsertMetrics, upsertValuationBenchmark, getMetrics } from '../db';
import { invalidateCache } from '../cache';
import { DataProvider } from '../providers';

async function safeDivide(a: number, b: number): number {
  return b !== 0 ? a / b : 0;
}

export async function updateValuation(
  env: Env,
  provider: DataProvider,
): Promise<void> {
  const tickers = await provider.fetchAllTickers();

  // 1. Update valuation benchmarks (sector and market PE/PS medians)
  // Collect all ticker PE/PS
  const sectorData = new Map<string, { pes: number[]; pss: number[] }>();
  const allPEs: number[] = [];
  const allPSs: number[] = [];

  for (const ticker of tickers) {
    const priceData = await provider.fetchPrice({ ticker });
    const financials = await getFinancials(env.DB, ticker);
    const latest = financials[0];
    if (!latest || !latest.revenue || !latest.net_income) continue;

    const pe = safeDivide(priceData.price, safeDivide(latest.net_income, latest.shares_outstanding));
    const ps = safeDivide(priceData.price, safeDivide(latest.revenue, latest.shares_outstanding));

    allPEs.push(pe);
    allPSs.push(ps);

    const company = await env.DB.prepare('SELECT sector FROM companies WHERE ticker = ?')
      .bind(ticker).first<{ sector: string }>();
    if (company) {
      const sector = company.sector || 'Unknown';
      if (!sectorData.has(sector)) sectorData.set(sector, { pes: [], pss: [] });
      sectorData.get(sector)!.pes.push(pe);
      sectorData.get(sector)!.pss.push(ps);
    }
  }

  // Compute medians and P75
  function median(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  function p75(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)]!;
  }

  // Store market benchmark
  await upsertValuationBenchmark(env.DB, {
    sector: 'ALL',
    benchmark_type: 'market',
    pe_median: median(allPEs),
    pe_p75: p75(allPEs),
    ps_median: median(allPSs),
    ps_p75: p75(allPSs),
    updated_at: '',
  });

  // Store sector benchmarks
  for (const [sector, data] of sectorData) {
    await upsertValuationBenchmark(env.DB, {
      sector,
      benchmark_type: 'sector',
      pe_median: median(data.pes),
      pe_p75: p75(data.pes),
      ps_median: median(data.pss),
      ps_p75: p75(data.pss),
      updated_at: '',
    });
  }

  // 2. Score each ticker
  const marketBench = await getValuationBenchmarks(env.DB, 'ALL');
  const marketRow = marketBench.find(b => b.benchmark_type === 'market');

  for (const ticker of tickers) {
    const priceData = await provider.fetchPrice({ ticker });
    const financials = await getFinancials(env.DB, ticker);
    const latest = financials[0];
    if (!latest) continue;

    const company = await env.DB.prepare('SELECT sector FROM companies WHERE ticker = ?')
      .bind(ticker).first<{ sector: string }>();
    const sector = company?.sector || 'Unknown';
    const sectorBenchs = await getValuationBenchmarks(env.DB, sector);
    const sectorRow = sectorBenchs.find(b => b.benchmark_type === 'sector');

    if (!sectorRow || !marketRow) continue;

    const pe = safeDivide(priceData.price, safeDivide(latest.net_income, latest.shares_outstanding));
    const ps = safeDivide(priceData.price, safeDivide(latest.revenue, latest.shares_outstanding));

    const result = computeValuationScore(pe, ps, sectorRow, marketRow);

    // Update metrics table (valuation only)
    const existing = await getMetrics(env.DB, ticker);
    const metrics = {
      ticker,
      quality_score: existing?.quality_score ?? 0,
      growth_score: existing?.growth_score ?? 0,
      valuation_score: result.score,
      risk_score: existing?.risk_score ?? 0,
      overall_score: Math.round(
        (existing?.quality_score ?? 0) * 0.30 +
        (existing?.growth_score ?? 0) * 0.30 +
        result.score * 0.20 +
        (existing?.risk_score ?? 0) * 0.20
      ),
      consistency_score: existing?.consistency_score ?? 0,
      updated_at: '',
    };
    await upsertMetrics(env.DB, metrics);

    // Invalidate cache
    await invalidateCache(ticker, env.KV);
  }
}
```

- [ ] **Step 2: Write weekly fundamentals job**

Calls quality/growth/risk engines for all tickers and upserts results.

```typescript
import { qualityEngine, growthEngine, riskEngine } from '../engines';
import { EngineOutput } from '../engines/types';
import { getFinancials, getMetrics, upsertMetrics, replaceMetricBreakdowns } from '../db';
import { invalidateCache } from '../cache';
import { FinancialRow } from '../types';

function breakdownToFlat(
  breakdown: Record<string, unknown>,
): Array<{ name: string; value: number; score: number }> {
  const result: Array<{ name: string; value: number; score: number }> = [];
  for (const [key, val] of Object.entries(breakdown)) {
    if (typeof val === 'object' && val !== null && 'value' in val && 'score' in val) {
      result.push({
        name: key,
        value: (val as { value: number }).value,
        score: (val as { score: number }).score,
      });
    }
  }
  return result;
}

export async function updateFundamentals(
  env: Env,
  tickers: string[],
): Promise<void> {
  for (const ticker of tickers) {
    const financials = await getFinancials(env.DB, ticker);
    if (financials.length === 0) continue;

    const input = { ticker, financials };

    // Run engines
    const qualityResult = qualityEngine.calculate(input);
    const growthResult = growthEngine.calculate(input);
    const riskResult = riskEngine.calculate(input);

    // Valuation score comes from existing metrics (set by daily job)
    const existing = await getMetrics(env.DB, ticker);
    const valuationScore = existing?.valuation_score ?? 0;

    const overallScore = Math.round(
      qualityResult.score * 0.30 +
      growthResult.score * 0.30 +
      valuationScore * 0.20 +
      riskResult.score * 0.20
    );

    // Upsert metrics
    await upsertMetrics(env.DB, {
      ticker,
      quality_score: qualityResult.score,
      growth_score: growthResult.score,
      valuation_score: valuationScore,
      risk_score: riskResult.score,
      overall_score: overallScore,
      consistency_score: 0, // computed separately if multiple years
      updated_at: '',
    });

    // Upsert breakdowns
    await replaceMetricBreakdowns(env.DB, ticker, 'quality', breakdownToFlat(qualityResult.breakdown));
    await replaceMetricBreakdowns(env.DB, ticker, 'growth', breakdownToFlat(growthResult.breakdown));
    await replaceMetricBreakdowns(env.DB, ticker, 'risk', breakdownToFlat(riskResult.breakdown));

    // Invalidate cache
    await invalidateCache(ticker, env.KV);
  }
}
```

- [ ] **Step 3: Write filing trigger job (update-all)**

```typescript
import { updateFundamentals } from './update-fundamentals';

export async function updateAll(
  env: Env,
  tickers: string[],
): Promise<void> {
  // Full recalculation: fundamentals (which covers quality/growth/risk)
  // plus mark valuation for recalculation on next daily run
  await updateFundamentals(env, tickers);

  // Force valuation update by deleting valuation cache keys
  for (const ticker of tickers) {
    await env.KV.delete(`v1:company:${ticker}`);
    await env.KV.delete(`v1:breakdown:${ticker}`);
    await env.KV.delete(`v1:financials:${ticker}`);
  }
}
```

---

## Phase 6: Worker Entry Point

### Task 16: Worker Router

**Files:**
- Create: `investment-platform/src/index.ts`

- [ ] **Step 1: Write Worker entry point**

Defines Env interface and routes requests to API handlers.

```typescript
import { handleCompany, handleBreakdown, handleFinancials } from './api';
import { updateValuation } from './jobs/update-valuation';
import { updateFundamentals } from './jobs/update-fundamentals';
import { updateAll } from './jobs/update-all';
import { secEdgarProvider } from './providers';
import { ErrorResponse } from './types';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // API routes
    const companyMatch = path.match(/^\/api\/company\/([A-Za-z]{1,5})$/);
    if (companyMatch && request.method === 'GET') {
      return handleCompany(request, env, companyMatch[1]!);
    }

    const breakdownMatch = path.match(/^\/api\/company\/([A-Za-z]{1,5})\/breakdown$/);
    if (breakdownMatch && request.method === 'GET') {
      return handleBreakdown(request, env, breakdownMatch[1]!);
    }

    const financialsMatch = path.match(/^\/api\/company\/([A-Za-z]{1,5})\/financials$/);
    if (financialsMatch && request.method === 'GET') {
      return handleFinancials(request, env, financialsMatch[1]!);
    }

    // 404
    const body: ErrorResponse = { error: 'Not found', status: 404 };
    return Response.json(body, { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;

    // Determine which job to run based on cron pattern
    // In production, use separate Worker scripts per cron trigger
    // For simplicity, check the cron string
    if (cron.includes('* * 0')) {
      // Weekly: fundamentals
      const tickers = await env.DB.prepare('SELECT ticker FROM companies')
        .all<{ ticker: string }>().then(r => r.results.map(row => row.ticker));
      await updateFundamentals(env, tickers);
    } else {
      // Daily (default): valuation
      await updateValuation(env, secEdgarProvider);
    }

    console.log(`Cron job completed: ${cron}`);
  },
};
```

---

## Phase 7: Tests

### Task 17: Engine Unit Tests

**Files:**
- Create: `investment-platform/test/engines/quality.test.ts`
- Create: `investment-platform/test/engines/growth.test.ts`
- Create: `investment-platform/test/engines/valuation.test.ts`
- Create: `investment-platform/test/engines/risk.test.ts`
- Create: `investment-platform/test/engines/overall.test.ts`

- [ ] **Step 1: Write quality engine test**

```typescript
import { describe, it, expect } from 'vitest';
import { qualityEngine } from '../../src/engines/quality-engine';

const mockFinancials = [
  {
    ticker: 'TEST',
    fiscal_year: 2025,
    revenue: 100_000,
    gross_profit: 60_000,
    operating_income: 30_000,
    net_income: 25_000,
    operating_cash_flow: 35_000,
    free_cash_flow: 20_000,
    total_assets: 200_000,
    total_liabilities: 80_000,
    shareholder_equity: 100_000,
    shares_outstanding: 10_000,
  },
];

describe('Quality Engine', () => {
  it('returns 0-100 score for valid financials', () => {
    const result = qualityEngine.calculate({ ticker: 'TEST', financials: mockFinancials });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns breakdown with roe, roic, fcfMargin, debtRatio', () => {
    const result = qualityEngine.calculate({ ticker: 'TEST', financials: mockFinancials });
    expect(result.breakdown).toHaveProperty('roe');
    expect(result.breakdown).toHaveProperty('roic');
    expect(result.breakdown).toHaveProperty('fcfMargin');
    expect(result.breakdown).toHaveProperty('debtRatio');
  });

  it('returns 0 for empty financials', () => {
    const result = qualityEngine.calculate({ ticker: 'TEST', financials: [] });
    expect(result.score).toBe(0);
  });

  it('handles zero denominator (no equity)', () => {
    const noEquity = [{ ...mockFinancials[0], shareholder_equity: 0, total_assets: 0 }];
    const result = qualityEngine.calculate({ ticker: 'TEST', financials: noEquity });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Write other engine tests following same pattern**

Growth engine test: needs 3 years of data, validates CAGR computation.
Risk engine test: validates Z-Score, F-Score (0-9), M-Score.
Overall engine test: validates weighted combination.

---

## Implementation Order

1. Task 1 → Project scaffold
2. Task 2 → D1 migration
3. Task 3 → Types
4. Task 4 → Engine interface + scoring helpers
5. Task 5 → Quality Engine
6. Task 6 → Growth Engine
7. Task 7 → Valuation Engine
8. Task 8 → Risk Engine
9. Task 9 → Overall Engine
10. Task 10 → Engine barrel
11. Task 11 → Provider interface
12. Task 12 → Cache layer (updated with `getFromKVOrDB` and `getCacheWithKey`)
13. Task 13 → DB helpers
14. Task 14 → API routes
15. Task 15 → Cron jobs
16. Task 16 → Worker entry point
17. Task 17 → Unit tests
