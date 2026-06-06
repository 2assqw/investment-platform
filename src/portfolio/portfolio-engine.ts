import { getMetrics, getCompany, getFactorScores } from '../db';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';
import { PortfolioHolding, Portfolio, PortfolioMetrics, PortfolioHealth } from './portfolio-types';

const MAX_POSITION = 10;
const MIN_POSITION = 2;
const MAX_SECTOR_PCT = 30;
const MAX_TICKERS = 20;

interface Candidate {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  overall: number;
  trust: number;
  growthConsistency: number;
  shareholderAlignment: number;
  cashConversion: number;
  industrySupport: string;
}

async function loadCandidates(db: D1Database, sortBy: string): Promise<Candidate[]> {
  const tickers = await db.prepare('SELECT ticker FROM metrics WHERE overall_score > 0 LIMIT 50')
    .all<{ ticker: string }>().then(r => r.results.map(rr => rr.ticker));

  const candidates: Candidate[] = [];

  for (const ticker of tickers) {
    try {
      const [metrics, company, factorRows] = await Promise.all([
        getMetrics(db, ticker),
        getCompany(db, ticker),
        getFactorScores(db, ticker),
      ]);
      if (!metrics) continue;

      const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');
      if (support.level === 'FAIL') continue;

      const v = await runValidation(db, ticker, support.level, []);
      const trust = Math.max(0, 100 - v.allWarnings.length * 10);
      if (trust < 80) continue;

      const factors: Record<string, number> = {};
      for (const row of factorRows) factors[row.factor_name] = row.score;

      if (v.allWarnings.some(w => w.includes('critical'))) continue;

      candidates.push({
        ticker,
        company: company?.name ?? ticker,
        sector: company?.sector ?? '',
        industry: company?.industry ?? '',
        quality: metrics.quality_score,
        growth: metrics.growth_score,
        valuation: metrics.valuation_score,
        risk: metrics.risk_score,
        overall: metrics.overall_score,
        trust,
        growthConsistency: factors['growth_consistency'] ?? 0,
        shareholderAlignment: factors['shareholder_alignment'] ?? 0,
        cashConversion: factors['cash_conversion'] ?? 0,
        industrySupport: support.level,
      });
    } catch { /* skip */ }
  }

  const getVal = (c: Candidate, key: string): number => {
    const map: Record<string, number> = {
      quality: c.quality, growth: c.growth, valuation: c.valuation,
      risk: c.risk, overall: c.overall, trust: c.trust,
      growthConsistency: c.growthConsistency,
      shareholderAlignment: c.shareholderAlignment,
      cashConversion: c.cashConversion,
    };
    return map[key] ?? 0;
  };
  candidates.sort((a, b) => getVal(b, sortBy) - getVal(a, sortBy));
  return candidates;
}

function applyAllocation(candidates: Candidate[], maxCount: number): PortfolioHolding[] {
  const selected = candidates.slice(0, maxCount);

  // Equal-weight with sector cap
  const weight = Math.min(MAX_POSITION, Math.max(MIN_POSITION, Math.floor(100 / selected.length)));
  const sectorCount: Record<string, number> = {};
  const holdings: PortfolioHolding[] = [];

  for (const c of selected) {
    sectorCount[c.sector] = (sectorCount[c.sector] ?? 0) + 1;
    const sectorPct = sectorCount[c.sector]! * weight;
    const adjustedWeight = sectorPct > MAX_SECTOR_PCT ? Math.floor(MAX_SECTOR_PCT / sectorCount[c.sector]!) : weight;

    holdings.push({
      ticker: c.ticker,
      company: c.company,
      sector: c.sector,
      weight: Math.max(MIN_POSITION, adjustedWeight),
      quality: c.quality,
      growth: c.growth,
      valuation: c.valuation,
      risk: c.risk,
      overall: c.overall,
      trust: c.trust,
    });
  }

  return holdings;
}

function computeMetrics(holdings: PortfolioHolding[]): PortfolioMetrics {
  if (holdings.length === 0) return { averageQuality: 0, averageGrowth: 0, averageValuation: 0, averageRisk: 0, averageTrust: 0, sectorCount: 0, concentrationRisk: 0 };

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const sectors = new Set(holdings.map(h => h.sector));

  return {
    averageQuality: Math.round(avg(holdings.map(h => h.quality))),
    averageGrowth: Math.round(avg(holdings.map(h => h.growth))),
    averageValuation: Math.round(avg(holdings.map(h => h.valuation))),
    averageRisk: Math.round(avg(holdings.map(h => h.risk))),
    averageTrust: Math.round(avg(holdings.map(h => h.trust))),
    sectorCount: sectors.size,
    concentrationRisk: Math.round(holdings.slice(0, 5).reduce((s, h) => s + h.weight, 0)),
  };
}

export async function buildPortfolio(db: D1Database, type: string): Promise<Portfolio> {
  let candidates: Candidate[] = [];

  switch (type) {
    case 'quality':
      candidates = await loadCandidates(db, 'quality');
      break;
    case 'growth':
      candidates = await loadCandidates(db, 'growth');
      break;
    case 'value':
      candidates = await loadCandidates(db, 'valuation');
      break;
    case 'compounder': {
      const all = await loadCandidates(db, 'quality');
      candidates = all
        .filter(c => c.quality >= 80 && c.growthConsistency >= 70)
        .sort((a, b) => (b.quality + b.growthConsistency) - (a.quality + a.growthConsistency));
      break;
    }
    case 'balanced': {
      const all = await loadCandidates(db, 'overall');
      candidates = all.sort((a, b) => b.overall - a.overall);
      break;
    }
    case 'shareholder':
      candidates = (await loadCandidates(db, 'overall'))
        .sort((a, b) => b.shareholderAlignment - a.shareholderAlignment);
      break;
    default:
      candidates = await loadCandidates(db, 'overall');
  }

  const holdings = applyAllocation(candidates, MAX_TICKERS);
  const metrics = computeMetrics(holdings);

  const names: Record<string, string> = {
    quality: 'Quality Portfolio',
    growth: 'Growth Portfolio',
    value: 'Value Portfolio',
    compounder: 'Compounder Portfolio',
    balanced: 'Balanced Portfolio',
    shareholder: 'Shareholder-Friendly Portfolio',
  };

  return {
    name: names[type] ?? `${type} Portfolio`,
    description: `Top ${MAX_TICKERS} stocks by ${type} score`,
    holdings,
    metrics,
  };
}

export async function getPortfoliosSummary(db: D1Database): Promise<{
  qualityPortfolio: Portfolio;
  growthPortfolio: Portfolio;
  valuePortfolio: Portfolio;
  compounderPortfolio: Portfolio;
  balancedPortfolio: Portfolio;
}> {
  const [quality, growth, value, compounder, balanced] = await Promise.all([
    buildPortfolio(db, 'quality'),
    buildPortfolio(db, 'growth'),
    buildPortfolio(db, 'value'),
    buildPortfolio(db, 'compounder'),
    buildPortfolio(db, 'balanced'),
  ]);
  return { qualityPortfolio: quality, growthPortfolio: growth, valuePortfolio: value, compounderPortfolio: compounder, balancedPortfolio: balanced };
}

export async function getPortfolioHealth(portfolio: Portfolio): Promise<PortfolioHealth> {
  const sectors = portfolio.holdings.map(h => h.sector);
  const unique = new Set(sectors);
  const diversification = Math.min(100, unique.size * 15 + Math.min(portfolio.holdings.length, 20) * 2);

  return {
    diversification: Math.round(diversification),
    sectorRisk: Math.round(100 - unique.size * 10),
    concentrationRisk: Math.round(portfolio.holdings.slice(0, 3).reduce((s, h) => s + h.weight, 0)),
    trustScore: Math.round(portfolio.metrics.averageTrust),
  };
}
