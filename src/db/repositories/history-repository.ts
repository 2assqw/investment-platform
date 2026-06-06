export async function insertScoreHistory(
  db: D1Database,
  ticker: string,
  scores: { quality: number; growth: number; valuation: number; risk: number; overall: number },
  trust: number,
  factors: { growthConsistency: number; shareholderAlignment: number; cashConversion: number },
  industrySupport: string,
): Promise<void> {
  await db.prepare(
    `INSERT INTO score_history (ticker, quality_score, growth_score, valuation_score, risk_score, overall_score, trust_score, growth_consistency, shareholder_alignment, cash_conversion, industry_support, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(ticker, scores.quality, scores.growth, scores.valuation, scores.risk, scores.overall, trust, factors.growthConsistency, factors.shareholderAlignment, factors.cashConversion, industrySupport).run();
}

export async function getScoreHistory(
  db: D1Database, ticker: string, limit: number = 180,
): Promise<Array<{
  ticker: string; quality_score: number; growth_score: number;
  valuation_score: number; risk_score: number; overall_score: number;
  trust_score: number; growth_consistency: number; shareholder_alignment: number;
  cash_conversion: number; industry_support: string; created_at: string;
}>> {
  const result = await db.prepare(
    'SELECT * FROM score_history WHERE ticker = ? ORDER BY created_at DESC LIMIT ?',
  ).bind(ticker.toUpperCase(), limit).all();
  return result.results as Array<{
    ticker: string; quality_score: number; growth_score: number;
    valuation_score: number; risk_score: number; overall_score: number;
    trust_score: number; growth_consistency: number; shareholder_alignment: number;
    cash_conversion: number; industry_support: string; created_at: string;
  }>;
}

export async function snapshotAllScores(db: D1Database): Promise<void> {
  // Batch all queries into a single DB round-trip where possible
  const metrics = await db.prepare('SELECT * FROM metrics WHERE overall_score > 0 LIMIT 20')
    .all<{ ticker: string; quality_score: number; growth_score: number; valuation_score: number; risk_score: number; overall_score: number }>();
  const factorRows = await db.prepare('SELECT ticker, factor_name, score FROM factor_scores')
    .all<{ ticker: string; factor_name: string; score: number }>();
  const companies = await db.prepare('SELECT ticker, sector FROM companies')
    .all<{ ticker: string; sector: string }>();

  // Index
  const fMap: Record<string, Record<string, number>> = {};
  for (const f of factorRows.results) {
    if (!fMap[f.ticker]) fMap[f.ticker] = {};
    fMap[f.ticker]![f.factor_name] = f.score;
  }
  const sectorMap: Record<string, string> = {};
  for (const c of companies.results) sectorMap[c.ticker] = c.sector;

  for (const m of metrics.results) {
    const ticker = m.ticker;
    const ff = fMap[ticker] ?? {};
    const sector = sectorMap[ticker] ?? '';
    const isFail = sector === 'Financial Services' || sector === 'Real Estate';

    await insertScoreHistory(db, ticker, {
      quality: m.quality_score, growth: m.growth_score,
      valuation: m.valuation_score, risk: m.risk_score, overall: m.overall_score,
    }, 80, {
      growthConsistency: ff['growth_consistency'] ?? 0,
      shareholderAlignment: ff['shareholder_alignment'] ?? 0,
      cashConversion: ff['cash_conversion'] ?? 0,
    }, isFail ? 'FAIL' : 'PASS');
  }
}

export async function getTrendingCompanies(
  db: D1Database, limit: number = 10,
): Promise<Array<{ ticker: string; overallChange: number; direction: string }>> {
  const tickers = await db.prepare('SELECT DISTINCT ticker FROM score_history')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const results: Array<{ ticker: string; overallChange: number; direction: string }> = [];

  for (const ticker of tickers.slice(0, 30)) {
    const rows = await getScoreHistory(db, ticker, 30);
    if (rows.length < 2) continue;
    const change = rows[0]!.overall_score - rows[rows.length - 1]!.overall_score;
    if (Math.abs(change) > 0) {
      results.push({ ticker, overallChange: change, direction: change > 0 ? 'up' : 'down' });
    }
  }

  results.sort((a, b) => b.overallChange - a.overallChange);
  return results.slice(0, limit);
}

export async function getScoreChanges(
  db: D1Database, ticker: string,
): Promise<{
  overallChange: number; qualityChange: number; growthChange: number;
  valuationChange: number; riskChange: number; primaryReason: string;
  trends: Array<{ type: string; change: number; impact: string }>;
} | null> {
  const rows = await getScoreHistory(db, ticker, 30);
  if (rows.length < 2) return null;

  const latest = rows[0]!;
  const first = rows[rows.length - 1]!;

  const qualityChange = latest.quality_score - first.quality_score;
  const growthChange = latest.growth_score - first.growth_score;
  const valuationChange = latest.valuation_score - first.valuation_score;
  const riskChange = latest.risk_score - first.risk_score;
  const overallChange = latest.overall_score - first.overall_score;

  const changes = [
    { name: 'valuation_compression', val: valuationChange },
    { name: 'valuation_expansion', val: -valuationChange },
    { name: 'quality_improvement', val: qualityChange },
    { name: 'growth_acceleration', val: growthChange },
    { name: 'risk_improvement', val: riskChange },
  ];
  changes.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
  const primaryReason = changes[0]!.val !== 0 ? changes[0]!.name : 'no_change';

  // Detect trends
  const trends: Array<{ type: string; change: number; impact: string }> = [];
  if (overallChange >= 10) trends.push({ type: 'improving_business', change: overallChange, impact: 'positive' });
  if (overallChange <= -10) trends.push({ type: 'deteriorating_business', change: overallChange, impact: 'negative' });
  if (valuationChange >= 15) trends.push({ type: 'valuation_compression', change: valuationChange, impact: 'positive' });
  if (valuationChange <= -15) trends.push({ type: 'valuation_expansion', change: valuationChange, impact: 'negative' });
  if (qualityChange >= 10) trends.push({ type: 'quality_improvement', change: qualityChange, impact: 'positive' });
  if (growthChange >= 10) trends.push({ type: 'growth_acceleration', change: growthChange, impact: 'positive' });
  if (riskChange <= -10) trends.push({ type: 'risk_deterioration', change: riskChange, impact: 'negative' });

  return { overallChange, qualityChange, growthChange, valuationChange, riskChange, primaryReason, trends };
}
