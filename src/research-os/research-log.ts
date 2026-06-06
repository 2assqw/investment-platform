import { Hypothesis, Experiment, ResearchNote, ResearchDecision, ResearchDashboard } from './research-types';

const SEED_HYPOTHESES = [
  { title: 'Share Buybacks Create Alpha', description: 'Companies reducing shares by >2% annually outperform market by 3%.', status: 'VALIDATED' as const },
  { title: 'Cash Conversion Predicts Quality', description: 'OCF/NI ratio > 1.0 predicts lower future drawdowns.', status: 'VALIDATED' as const },
  { title: 'Growth Consistency Matters More Than Growth Rate', description: 'CV of revenue growth is a stronger predictor than CAGR.', status: 'TESTING' as const },
  { title: 'Valuation Expansion Creates Momentum', description: 'PE expansion from P25 to P75 within sector creates 6-month alpha.', status: 'IDEA' as const },
  { title: 'High ROIC Compounds Over Time', description: 'Companies with ROIC > 20% for 5 consecutive years outperform.', status: 'TESTING' as const },
  { title: 'Low Debt Companies Outperform in Rising Rates', description: 'Debt/Equity < 0.5 companies outperform when rates rise.', status: 'IDEA' as const },
  { title: 'Insider Buying Predicts Turnarounds', description: 'Net insider buying > 0.1% of float predicts 12-month outperformance.', status: 'IDEA' as const },
];

const SEED_NOTES = [
  { title: 'Energy Factors Break During Commodity Supercycles', content: 'Valuation factors applied to energy companies produce false positives during commodity price spikes. Need cycle-adjusted metrics.', tags: 'energy,valuation,cyclical' },
  { title: 'ROIC is Stronger Than ROE in Technology', content: 'Technology companies with high ROIC > 30% outperform ROE-based screens. ROE is distorted by buybacks and debt.', tags: 'technology,quality,roic' },
  { title: 'Buybacks Predict Returns Better Than Dividends', content: 'Share count CAGR of -3% is a stronger signal than dividend yield for total shareholder return.', tags: 'capital-allocation,buybacks,dividends' },
  { title: 'Banks Need Different Metrics', content: 'ROIC, FCF Margin, and Debt Ratio are inappropriate for banks. Need Net Interest Margin, Efficiency Ratio, and CET1 ratio.', tags: 'banking,sector-model' },
  { title: 'REITs Require FFO-Based Analysis', content: 'Net income is meaningless for REITs. FFO/AFFO, NOI, occupancy rates are the correct metrics.', tags: 'reit,sector-model' },
];

export async function initResearchLog(db: D1Database): Promise<void> {
  // Seed hypotheses
  for (const h of SEED_HYPOTHESES) {
    await db.prepare(
      'INSERT OR IGNORE INTO research_hypotheses (id, title, description, author, status, created_at) VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM research_hypotheses), ?, ?, ?, ?, datetime(\'now\'))',
    ).bind(h.title, h.description, 'system', h.status).run();
  }
  // Seed notes
  for (const n of SEED_NOTES) {
    await db.prepare(
      'INSERT INTO research_notes (title, content, tags, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
    ).bind(n.title, n.content, n.tags).run();
  }
}

export async function getHypotheses(db: D1Database): Promise<Hypothesis[]> {
  const r = await db.prepare('SELECT * FROM research_hypotheses ORDER BY created_at DESC').all<Hypothesis>();
  return r.results;
}

export async function getExperiments(db: D1Database): Promise<Experiment[]> {
  const r = await db.prepare('SELECT * FROM experiments ORDER BY created_at DESC LIMIT 50').all<Experiment>();
  return r.results;
}

export async function getNotes(db: D1Database): Promise<ResearchNote[]> {
  const r = await db.prepare('SELECT * FROM research_notes ORDER BY created_at DESC').all<ResearchNote>();
  return r.results;
}

export async function getDecisions(db: D1Database): Promise<ResearchDecision[]> {
  const r = await db.prepare('SELECT * FROM research_decisions ORDER BY created_at DESC LIMIT 50').all<ResearchDecision>();
  return r.results;
}

export async function logDecision(
  db: D1Database,
  action: string, target: string, field: string | null,
  oldValue: string | null, newValue: string | null, reason: string,
): Promise<void> {
  await db.prepare(
    'INSERT INTO research_decisions (action, target, field, old_value, new_value, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
  ).bind(action, target, field, oldValue, newValue, reason).run();
}

export async function getResearchDashboard(db: D1Database): Promise<ResearchDashboard> {
  const [h, e, n, d] = await Promise.all([
    getHypotheses(db), getExperiments(db), getNotes(db), getDecisions(db),
  ]);
  return {
    activeHypotheses: h.filter(x => x.status === 'TESTING' || x.status === 'IDEA').length,
    validatedHypotheses: h.filter(x => x.status === 'VALIDATED').length,
    rejectedHypotheses: h.filter(x => x.status === 'REJECTED').length,
    totalExperiments: e.length,
    activeExperiments: e.filter(x => !x.result).length,
    notes: n.length,
    decisions: d.length,
    recentDecisions: d.slice(0, 5),
  };
}
