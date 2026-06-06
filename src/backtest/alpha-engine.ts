import { AlphaReport, BucketStats, FactorValidation, ModelHealth } from './validation-types';

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function winRate(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.filter(r => r > 0).length / returns.length * 100;
}

function sharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mu = avg(returns);
  const variance = returns.reduce((s, r) => s + (r - mu) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mu / std) * Math.sqrt(252) : 0; // annualized
}

function bucketName(score: number): string {
  if (score >= 80) return 'bucket80Plus';
  if (score >= 70) return 'bucket70to79';
  if (score >= 60) return 'bucket60to69';
  if (score >= 50) return 'bucket50to59';
  return 'bucketBelow50';
}

export async function generateAlphaReport(db: D1Database): Promise<AlphaReport> {
  const snapshots = await db.prepare(
    'SELECT ticker, overall_score, quality_score, growth_score, valuation_score, risk_score, created_at FROM score_history ORDER BY created_at DESC LIMIT 200'
  ).all<{ ticker: string; overall_score: number; quality_score: number; growth_score: number; valuation_score: number; risk_score: number; created_at: string }>();

  const prices = await db.prepare(
    'SELECT ticker, date, close_price FROM price_history ORDER BY date DESC LIMIT 500'
  ).all<{ ticker: string; date: string; close_price: number }>();

  // Build price lookup
  const priceMap: Record<string, Record<string, number>> = {};
  for (const p of prices.results) {
    if (!priceMap[p.ticker]) priceMap[p.ticker] = {};
    priceMap[p.ticker]![p.date] = p.close_price;
  }

  const buckets: Record<string, number[]> = {};
  for (const s of snapshots.results) {
    if (s.overall_score <= 0) continue;
    const b = bucketName(s.overall_score);
    if (!buckets[b]) buckets[b] = [];

    // Look up forward 30-day return if available
    const tickerPrices = priceMap[s.ticker];
    if (tickerPrices) {
      const priceDates = Object.keys(tickerPrices).sort();
      const snapIdx = priceDates.findIndex(d => d >= s.created_at.substring(0, 10));
      if (snapIdx >= 0 && snapIdx + 1 < priceDates.length) {
        const entryPrice = tickerPrices[priceDates[snapIdx]!]!;
        const exitPrice = tickerPrices[priceDates[Math.min(snapIdx + 30, priceDates.length - 1)]!]!;
        buckets[b]!.push((exitPrice - entryPrice) / entryPrice * 100);
      }
    }
  }

  const overall: Record<string, BucketStats> = {};
  for (const [b, returns] of Object.entries(buckets)) {
    overall[b] = {
      bucket: b,
      count: returns.length,
      avgReturn: Math.round(avg(returns) * 10) / 10,
      medianReturn: Math.round(median(returns) * 10) / 10,
      winRate: Math.round(winRate(returns)),
      sharpeRatio: Math.round(sharpe(returns) * 100) / 100,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    totalSnapshots: snapshots.results.length,
    totalTickers: [...new Set(snapshots.results.map(s => s.ticker))].length,
    overall,
  };
}

export async function validateFactors(db: D1Database): Promise<FactorValidation[]> {
  const factorMap = ['growth_consistency', 'shareholder_alignment', 'cash_conversion'];
  const results: FactorValidation[] = [];

  for (const factor of factorMap) {
    results.push({
      factor,
      avgReturn: 0,
      winRate: 0,
      count: 0,
    });
  }

  return results;
}

export async function getModelHealth(db: D1Database): Promise<ModelHealth> {
  const factors = await validateFactors(db);
  const validated = factors.filter(f => f.count > 0);
  const unvalidated = factors.filter(f => f.count === 0);

  const topFactors = validated
    .sort((a, b) => b.avgReturn - a.avgReturn)
    .slice(0, 3)
    .map(f => ({ factor: f.factor, alphaScore: f.avgReturn }));

  return {
    alphaScore: validated.length > 0 ? Math.round(avg(validated.map(f => f.avgReturn)) * 10) / 10 : 0,
    validatedFactors: validated.length,
    unvalidatedFactors: unvalidated.length,
    bestPredictor: validated.length > 0 ? validated.sort((a, b) => b.avgReturn - a.avgReturn)[0]!.factor : null,
    topFactors,
  };
}
