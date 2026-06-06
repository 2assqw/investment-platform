import { Env } from '../types';
import { getMetrics, getMetricDetails, getFinancials } from '../db';
import { getSupportSummary } from '../classification';

// ============================================================
// Types
// ============================================================

interface TickerScore {
  ticker: string;
  quality: number;
  growth: number;
  risk: number;
  overall: number;
}

interface SectorCoverage {
  tickers: string[];
  status: 'PASS' | 'WARNING' | 'FAIL';
  observations: string[];
  scores: TickerScore[];
}

interface Anomaly {
  ticker: string;
  type: string;
  detail: string;
}

interface CoverageReport {
  generatedAt: string;
  engineVersion: string;
  coverage: Record<string, SectorCoverage>;
  supportSummary: Record<string, { level: string; reason: string | null }>;
  anomalies: Anomaly[];
  recommendations: string[];
}

// ============================================================
// Test matrix
// ============================================================

interface SectorDef {
  name: string;
  tickers: string[];
}

const SECTORS: SectorDef[] = [
  { name: 'technology', tickers: ['NVDA', 'MSFT', 'META', 'AAPL'] },
  { name: 'financial', tickers: ['JPM', 'BAC'] },
  { name: 'energy', tickers: ['XOM'] },
  { name: 'mining', tickers: ['FCX'] },
  { name: 'reit', tickers: ['O', 'PLD'] },
];

// ============================================================
// Sector validation rules
// ============================================================

function classifySector(sector: string, scores: TickerScore[]): { status: 'PASS' | 'WARNING' | 'FAIL'; observations: string[] } {
  const observations: string[] = [];

  switch (sector) {
    case 'technology': {
      const failures = scores.filter(s => s.quality < 50 || s.growth === 0 || s.risk === 0);
      const warnings = scores.filter(s => s.quality < 70 || s.growth < 40 || s.risk < 60);

      if (failures.length > 0) {
        failures.forEach(s => {
          if (s.quality < 50) observations.push(`${s.ticker}: Quality ${s.quality} < 50`);
          if (s.growth === 0) observations.push(`${s.ticker}: Growth = 0 (data missing)`);
          if (s.risk === 0) observations.push(`${s.ticker}: Risk = 0 (data missing)`);
        });
        return { status: 'WARNING', observations };
      }
      if (warnings.length > 0) {
        warnings.forEach(s => {
          if (s.quality < 70) observations.push(`${s.ticker}: Quality ${s.quality} < expected 70`);
          if (s.growth < 40) observations.push(`${s.ticker}: Growth ${s.growth} < expected 40`);
          if (s.risk < 60) observations.push(`${s.ticker}: Risk ${s.risk} < expected 60`);
        });
        return { status: 'WARNING', observations };
      }
      return { status: 'PASS', observations: ['All technology tickers within expected ranges.'] };
    }

    case 'financial': {
      observations.push('Banks use Net Interest Income, not Operating Income → ROIC = 0');
      observations.push('Bank OCF swings negative from lending activity → FCF Margin distorted');
      observations.push('Deposits are liabilities → Debt Ratio 90%+ is normal but penalized');
      scores.forEach(s => {
        if (s.quality <= 20) observations.push(`${s.ticker}: Bank model fundamentally incompatible (Quality=${s.quality})`);
      });
      return { status: 'FAIL', observations };
    }

    case 'reit': {
      observations.push('REITs use FFO/AFFO, not Net Income → EPS-based metrics invalid');
      observations.push('REIT OCF reporting differs → FCF absent for some tickers');
      observations.push('REIT debt structure differs from industrials → Debt Ratio distorted');
      const broken = scores.filter(s => s.quality <= 15 || s.growth === 0);
      if (broken.length > 0) {
        return { status: 'FAIL', observations };
      }
      return { status: 'WARNING', observations };
    }

    case 'mining': {
      const hasNegativeGrowth = scores.some(s => s.growth < 10);
      if (hasNegativeGrowth) {
        observations.push('Cyclical commodity exposure → low/negative growth periods expected');
        observations.push('FCF swings with commodity prices → normal for mining sector');
      }
      const extremes = scores.filter(s => s.quality === 0 || s.risk === 0);
      if (extremes.length > 0) {
        return { status: 'WARNING', observations };
      }
      return { status: 'PASS', observations: ['Mining scores within expected cyclical range.'] };
    }

    case 'energy': {
      observations.push('Oil & gas: cyclical revenue and earnings → growth varies by cycle');
      const hasLowQuality = scores.some(s => s.quality < 50);
      if (hasLowQuality) {
        observations.push('Energy sector Quality partially impacted by missing OI tag');
        return { status: 'WARNING', observations };
      }
      return { status: 'PASS', observations };
    }

    default:
      return { status: 'WARNING', observations: ['Unknown sector — no validation rules defined.'] };
  }
}

// ============================================================
// Anomaly detection
// ============================================================

function detectAnomalies(
  ticker: string,
  scores: TickerScore,
  breakdownsExist: boolean,
  fiscalYears: number,
  hasSplitWarning: boolean,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (scores.quality === 0) anomalies.push({ ticker, type: 'quality_zero', detail: 'Quality score is 0 — engine may have no data' });
  if (scores.growth === 0) anomalies.push({ ticker, type: 'growth_zero', detail: 'Growth score is 0 — insufficient fiscal years or CAGR data' });
  if (scores.risk === 0) anomalies.push({ ticker, type: 'risk_zero', detail: 'Risk score is 0 — engine may have no data' });

  if (scores.quality < 0 || scores.quality > 100) anomalies.push({ ticker, type: 'score_oob', detail: `Quality score ${scores.quality} outside 0-100` });
  if (scores.growth < 0 || scores.growth > 100) anomalies.push({ ticker, type: 'score_oob', detail: `Growth score ${scores.growth} outside 0-100` });
  if (scores.risk < 0 || scores.risk > 100) anomalies.push({ ticker, type: 'score_oob', detail: `Risk score ${scores.risk} outside 0-100` });
  if (scores.overall < 0 || scores.overall > 100) anomalies.push({ ticker, type: 'score_oob', detail: `Overall score ${scores.overall} outside 0-100` });

  if (!breakdownsExist) anomalies.push({ ticker, type: 'missing_breakdowns', detail: 'No metric breakdown data in D1' });
  if (fiscalYears === 0) anomalies.push({ ticker, type: 'missing_financials', detail: 'No financial data in D1' });
  if (fiscalYears > 0 && fiscalYears < 4) anomalies.push({ ticker, type: 'low_history', detail: `Only ${fiscalYears} fiscal years (need 4+ for CAGR)` });

  if (hasSplitWarning) anomalies.push({ ticker, type: 'stock_split_warning', detail: 'Normalizer detected possible stock split — EPS CAGR may be unreliable' });

  return anomalies;
}

function checkCAGRAnomaly(
  ticker: string,
  breakdown: Record<string, Record<string, { value: number; score: number }>>,
  scores: TickerScore,
): Anomaly | null {
  const g = breakdown.growth;
  if (!g) return null;

  const revCagr = g.revenueCagr?.value ?? 0;
  const epsCagr = g.epsCagr?.value ?? 0;
  const fcfCagr = g.fcfCagr?.value ?? 0;

  // Revenue positive (>5%) but EPS or FCF negative
  if (revCagr > 5 && (epsCagr < -5 || fcfCagr < -10)) {
    return {
      ticker,
      type: 'cagr_divergence',
      detail: `Revenue CAGR +${revCagr.toFixed(1)}% but EPS ${epsCagr.toFixed(1)}% / FCF ${fcfCagr.toFixed(1)}% — possible split or cyclical distortion`,
    };
  }
  return null;
}

// ============================================================
// Report generation
// ============================================================

export async function generateCoverageReport(env: Env): Promise<Response> {
  const allAnomalies: Anomaly[] = [];
  const coverage: Record<string, SectorCoverage> = {};
  const recommendations: string[] = [];

  for (const sector of SECTORS) {
    const sectorScores: TickerScore[] = [];

    for (const ticker of sector.tickers) {
      try {
        const [metrics, breakdownRows, financials] = await Promise.all([
          getMetrics(env.DB, ticker),
          getMetricDetails(env.DB, ticker),
          getFinancials(env.DB, ticker),
        ]);

        if (!metrics) {
          allAnomalies.push({ ticker, type: 'no_data', detail: 'No metrics in D1 — run seed first' });
          continue;
        }

        const score: TickerScore = {
          ticker,
          quality: metrics.quality_score,
          growth: metrics.growth_score,
          risk: metrics.risk_score,
          overall: metrics.overall_score,
        };
        sectorScores.push(score);

        // Build breakdown map for CAGR check
        const breakdown: Record<string, Record<string, { value: number; score: number }>> = {};
        for (const row of breakdownRows) {
          if (!breakdown[row.engine]) breakdown[row.engine] = {};
          breakdown[row.engine]![row.metric_name] = { value: row.metric_value, score: row.metric_score };
        }

        // Detect anomalies
        const breakdownsExist = breakdownRows.length > 0;
        const hasSplitWarning = breakdownRows.some(
          r => r.engine === 'growth' && r.metric_name === 'epsCagr' && (r.metric_value < 0),
        ) && financials.some((f, i, arr) => {
          if (i === 0) return false;
          const ratio = arr[i]!.shares_outstanding / arr[i-1]!.shares_outstanding;
          return ratio > 1.5 || ratio < 0.67;
        });

        const tickerAnomalies = detectAnomalies(ticker, score, breakdownsExist, financials.length, hasSplitWarning);
        allAnomalies.push(...tickerAnomalies);

        // CAGR divergence check
        const cagrAnomaly = checkCAGRAnomaly(ticker, breakdown, score);
        if (cagrAnomaly) allAnomalies.push(cagrAnomaly);

      } catch (err) {
        allAnomalies.push({ ticker, type: 'error', detail: String(err) });
      }
    }

    const { status, observations } = classifySector(sector.name, sectorScores);
    coverage[sector.name] = {
      tickers: sector.tickers,
      status,
      observations,
      scores: sectorScores,
    };
  }

  // Generate recommendations
  const failedSectors = Object.entries(coverage).filter(([, c]) => c.status === 'FAIL');
  if (failedSectors.length > 0) {
    recommendations.push(
      `${failedSectors.map(([n]) => n).join(', ')} require dedicated sector-specific engines.`
    );
  }
  const warnedSectors = Object.entries(coverage).filter(([, c]) => c.status === 'WARNING');
  if (warnedSectors.length > 0) {
    recommendations.push(
      `${warnedSectors.map(([n]) => n).join(', ')} are partially compatible — review data quality first.`
    );
  }
  if (allAnomalies.some(a => a.type === 'stock_split_warning')) {
    recommendations.push('Stock split adjustment engine needed for accurate cross-period comparison.');
  }
  if (allAnomalies.some(a => a.type === 'cagr_divergence')) {
    recommendations.push('CAGR divergence detected — investigate data quality before tuning sector models.');
  }

  const report: CoverageReport = {
    generatedAt: new Date().toISOString(),
    engineVersion: '1.0.0',
    coverage,
    supportSummary: getSupportSummary(),
    anomalies: allAnomalies,
    recommendations,
  };

  return Response.json(report);
}
