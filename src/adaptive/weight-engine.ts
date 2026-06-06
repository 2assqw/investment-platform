import { FactorWeight, AdaptiveModel, WeightEvolution, FactorAttribution, StaticVsAdaptive } from './adaptive-types';

const DEFAULT_WEIGHTS: Record<string, number> = {
  quality: 0.30,
  growth: 0.30,
  valuation: 0.20,
  risk: 0.20,
};

const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 0.40;
const MAX_CHANGE = 0.05; // per update

export async function initWeights(db: D1Database): Promise<void> {
  for (const [factor, weight] of Object.entries(DEFAULT_WEIGHTS)) {
    await db.prepare(
      `INSERT OR IGNORE INTO factor_weights (factor_name, current_weight, previous_weight, alpha_score, confidence, updated_at)
       VALUES (?, ?, NULL, 0, 50, datetime('now'))`,
    ).bind(factor, weight).run();
  }
}

export async function getWeights(db: D1Database): Promise<Record<string, number>> {
  const r = await db.prepare('SELECT factor_name, current_weight FROM factor_weights').all<{ factor_name: string; current_weight: number }>();
  const weights: Record<string, number> = {};
  for (const row of r.results) weights[row.factor_name] = row.current_weight;
  if (Object.keys(weights).length === 0) return { ...DEFAULT_WEIGHTS };
  return weights;
}

export async function updateWeights(
  db: D1Database,
  alphaData: Record<string, { alpha: number; winRate: number; sharpe: number }>,
): Promise<{ updated: boolean; changes: WeightEvolution[] }> {
  const current = await db.prepare('SELECT * FROM factor_weights').all<FactorWeight>();
  const changes: WeightEvolution[] = [];

  // Build current weight map
  const weightMap: Record<string, number> = {};
  for (const row of current.results) weightMap[row.factor_name] = row.current_weight;
  if (Object.keys(weightMap).length === 0) {
    for (const [k, v] of Object.entries(DEFAULT_WEIGHTS)) weightMap[k] = v;
  }

  // Calculate adjustments
  const adjustments: Record<string, number> = {};
  let totalAdjust = 0;

  for (const [factor, data] of Object.entries(alphaData)) {
    if (!weightMap[factor]) continue;
    let adjust = 0;
    if (data.alpha > 5 && data.winRate > 55) adjust = MAX_CHANGE;
    else if (data.alpha > 0 && data.winRate > 50) adjust = 0.02;
    else if (data.alpha < -5) adjust = -MAX_CHANGE;
    else if (data.alpha < 0) adjust = -0.02;
    adjustments[factor] = adjust;
    totalAdjust += adjust;
  }

  // Normalize to keep total = 1.0
  if (Math.abs(totalAdjust) > 0.001) {
    const distribute = -totalAdjust / Object.keys(weightMap).filter(k => !adjustments[k]).length;
    for (const k of Object.keys(weightMap)) {
      if (!adjustments[k]) adjustments[k] = distribute;
    }
  }

  for (const [factor, adj] of Object.entries(adjustments)) {
    const oldW = weightMap[factor] ?? 0;
    let newW = oldW + adj;
    newW = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newW));

    if (Math.abs(newW - oldW) > 0.001) {
      await db.prepare(
        `UPDATE factor_weights SET previous_weight = current_weight, current_weight = ?, alpha_score = ?, confidence = ?, win_rate = ?, sharpe = ?, updated_at = datetime('now') WHERE factor_name = ?`,
      ).bind(newW, alphaData[factor]?.alpha ?? 0, Math.min(100, 50 + (alphaData[factor]?.alpha ?? 0) * 5), alphaData[factor]?.winRate ?? 0, alphaData[factor]?.sharpe ?? 0, factor).run();

      changes.push({ factor, previous: Math.round(oldW * 100), current: Math.round(newW * 100), change: Math.round((newW - oldW) * 100) });
    }
  }

  return { updated: changes.length > 0, changes };
}

export async function getWeightEvolution(db: D1Database): Promise<WeightEvolution[]> {
  const current = await db.prepare('SELECT * FROM factor_weights').all<FactorWeight>();
  return current.results.map(r => ({
    factor: r.factor_name,
    previous: Math.round((r.previous_weight ?? r.current_weight) * 100),
    current: Math.round(r.current_weight * 100),
    change: Math.round((r.current_weight - (r.previous_weight ?? r.current_weight)) * 100),
  }));
}

export async function getFactorAttribution(db: D1Database): Promise<FactorAttribution> {
  const weights = await db.prepare('SELECT * FROM factor_weights ORDER BY alpha_score DESC').all<FactorWeight>();
  const sorted = weights.results;
  return {
    bestFactor: sorted[0]?.factor_name ?? null,
    bestAlpha: Math.round((sorted[0]?.alpha_score ?? 0) * 10) / 10,
    worstFactor: sorted[sorted.length - 1]?.factor_name ?? null,
    worstAlpha: Math.round((sorted[sorted.length - 1]?.alpha_score ?? 0) * 10) / 10,
    totalAlpha: Math.round(sorted.reduce((s, r) => s + r.alpha_score, 0) * 10) / 10,
  };
}

export function computeAdaptiveScore(
  scores: Record<string, number>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const [factor, weight] of Object.entries(weights)) {
    total += (scores[factor] ?? 0) * weight;
  }
  return Math.round(total);
}

export function compareStaticVsAdaptive(
  staticWeighted: number,
  adaptiveWeighted: number,
): StaticVsAdaptive {
  const improvement = adaptiveWeighted - staticWeighted;
  return {
    staticReturn: Math.round(staticWeighted * 10) / 10,
    adaptiveReturn: Math.round(adaptiveWeighted * 10) / 10,
    improvement: Math.round(improvement * 10) / 10,
    confidence: Math.min(100, 50 + Math.abs(improvement) * 10),
  };
}
