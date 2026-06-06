import { FactorRegistryEntry, FactorResult, FactorReport, FactorComparison, FactorDashboard } from './research-types';

const EXPERIMENTAL_FACTORS: Omit<FactorRegistryEntry, 'created_at'>[] = [
  { factor_id: 'growth_consistency', factor_name: 'Growth Consistency', category: 'Growth', status: 'production', description: 'Revenue growth stability over time' },
  { factor_id: 'shareholder_alignment', factor_name: 'Shareholder Alignment', category: 'Capital Allocation', status: 'production', description: 'Share buyback vs dilution trend' },
  { factor_id: 'cash_conversion', factor_name: 'Cash Conversion', category: 'Quality', status: 'production', description: 'OCF/NI ratio for earnings quality' },
  { factor_id: 'revenue_stability', factor_name: 'Revenue Stability', category: 'Growth', status: 'experimental', description: 'Revenue YoY standard deviation' },
  { factor_id: 'fcf_stability', factor_name: 'FCF Stability', category: 'Quality', status: 'experimental', description: 'Free cash flow stability' },
  { factor_id: 'share_reduction_rate', factor_name: 'Share Reduction Rate', category: 'Capital Allocation', status: 'experimental', description: 'Annual share count reduction %' },
  { factor_id: 'debt_reduction_rate', factor_name: 'Debt Reduction Rate', category: 'Risk', status: 'experimental', description: 'Annual debt ratio improvement' },
  { factor_id: 'margin_expansion', factor_name: 'Margin Expansion', category: 'Quality', status: 'experimental', description: 'Gross margin trend improvement' },
  { factor_id: 'roic_improvement', factor_name: 'ROIC Improvement', category: 'Quality', status: 'experimental', description: 'ROIC trend over 3 years' },
  { factor_id: 'cash_conversion_trend', factor_name: 'Cash Conversion Trend', category: 'Quality', status: 'experimental', description: 'Cash conversion ratio trend' },
  { factor_id: 'earnings_quality_trend', factor_name: 'Earnings Quality Trend', category: 'Quality', status: 'experimental', description: 'Accruals ratio trend' },
];

export async function initFactorRegistry(db: D1Database): Promise<void> {
  for (const f of EXPERIMENTAL_FACTORS) {
    await db.prepare(
      `INSERT OR IGNORE INTO factor_registry (factor_id, factor_name, category, status, description, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(f.factor_id, f.factor_name, f.category, f.status, f.description).run();
  }
}

export async function getFactorRegistry(db: D1Database): Promise<FactorRegistryEntry[]> {
  const r = await db.prepare('SELECT * FROM factor_registry ORDER BY category').all<FactorRegistryEntry>();
  return r.results;
}

export async function getFactorResults(db: D1Database, factorId: string): Promise<FactorResult | null> {
  return db.prepare('SELECT * FROM factor_results WHERE factor_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(factorId).first<FactorResult>();
}

export async function submitFactorResult(db: D1Database, result: Omit<FactorResult, 'created_at'>): Promise<void> {
  await db.prepare(
    `INSERT INTO factor_results (factor_id, annual_return, win_rate, sharpe, max_drawdown, information_ratio, alpha_score, period_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(result.factor_id, result.annual_return, result.win_rate, result.sharpe, result.max_drawdown, result.information_ratio, result.alpha_score, result.period_days).run();
}

export async function promoteFactors(db: D1Database): Promise<void> {
  const results = await db.prepare('SELECT factor_id, alpha_score, win_rate, sharpe FROM factor_results ORDER BY created_at DESC')
    .all<{ factor_id: string; alpha_score: number; win_rate: number; sharpe: number }>();

  const latestByFactor: Record<string, { alpha: number; win: number; sharpe: number }> = {};
  for (const r of results.results) {
    if (!latestByFactor[r.factor_id]) {
      latestByFactor[r.factor_id] = { alpha: r.alpha_score, win: r.win_rate, sharpe: r.sharpe };
    }
  }

  for (const [factorId, metrics] of Object.entries(latestByFactor)) {
    if (metrics.alpha > 7 && metrics.win > 55 && metrics.sharpe > 0.8) {
      await db.prepare('UPDATE factor_registry SET status = ? WHERE factor_id = ?')
        .bind('production', factorId).run();
    } else if (metrics.alpha < 0) {
      await db.prepare('UPDATE factor_registry SET status = ? WHERE factor_id = ?')
        .bind('retired', factorId).run();
    }
  }
}

export async function getFactorReports(db: D1Database): Promise<FactorReport[]> {
  const registry = await getFactorRegistry(db);
  const reports: FactorReport[] = [];

  for (const f of registry) {
    const result = await getFactorResults(db, f.factor_id);
    reports.push({
      factor: f.factor_id,
      category: f.category,
      status: f.status,
      annualReturn: result?.annual_return ?? 0,
      winRate: result?.win_rate ?? 0,
      sharpe: result?.sharpe ?? 0,
      alphaScore: result?.alpha_score ?? 0,
    });
  }

  reports.sort((a, b) => b.alphaScore - a.alphaScore);
  return reports;
}

export async function compareFactors(db: D1Database): Promise<FactorComparison> {
  const reports = await getFactorReports(db);
  const validated = reports.filter(r => r.status === 'production' || r.status === 'validated');
  return {
    factors: validated,
    topFactor: validated.length > 0 ? validated[0]!.factor : null,
    averageAlpha: validated.length > 0 ? Math.round(validated.reduce((s, f) => s + f.alphaScore, 0) / validated.length * 10) / 10 : 0,
  };
}

export async function getFactorDashboard(db: D1Database): Promise<FactorDashboard> {
  const registry = await getFactorRegistry(db);
  return {
    experimental: registry.filter(f => f.status === 'experimental').length,
    validated: registry.filter(f => f.status === 'validated' || f.status === 'approved').length,
    production: registry.filter(f => f.status === 'production').length,
    retired: registry.filter(f => f.status === 'retired').length,
    total: registry.length,
  };
}

export async function buildResearchPortfolio(db: D1Database): Promise<{ tickers: string[]; factors: string[] }> {
  const reports = await compareFactors(db);
  const topFactors = reports.factors.slice(0, 3).map(f => f.factor);

  const tickers = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0 LIMIT 10')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  return { tickers, factors: topFactors };
}
