import { secEdgarProvider } from '../providers';
import { qualityEngine, growthEngine, riskEngine, valuationEngine } from '../engines';
import { EngineInput } from '../engines/types';
import { defaultNormalizer } from '../normalizers';
import { validateFinancials, filterValidFinancials } from '../validation';
import { computeAllFactors } from '../factors/factor-engine';
import {
  upsertCompany,
  upsertFinancials,
  upsertMetrics,
  upsertMetricDetails,
  getBenchmarks,
  upsertFactorScores,
} from '../db';
import { Env, MetricRow } from '../types';

// ============================================================
// Company metadata (ticker → name, sector, industry, cik)
// ============================================================

interface CompanyMeta {
  cik: string;
  name: string;
  sector: string;
  industry: string;
  market_cap: number;
}

const COMPANY_META: Record<string, CompanyMeta> = {
  AAPL: { cik: '0000320193', name: 'Apple Inc.',
      market_cap: 3200000000000,
      sector: 'Technology', industry: 'Consumer Electronics' },
  AMZN: { cik: '0001018724', name: 'Amazon.com Inc.',
      market_cap: 2000000000000,
      sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  BAC: { cik: '0000070858', name: 'Bank of America Corp.',
      market_cap: 320000000000,
      sector: 'Financial Services', industry: 'Banks - Diversified' },
  COST: { cik: '0000909832', name: 'Costco Wholesale Corp.',
      market_cap: 380000000000,
      sector: 'Consumer Defensive', industry: 'Discount Stores' },
  CVX: { cik: '0000093410', name: 'Chevron Corp.',
      market_cap: 280000000000,
      sector: 'Energy', industry: 'Oil & Gas Integrated' },
  FCX: { cik: '0000831259', name: 'Freeport-McMoRan Inc.',
      market_cap: 65000000000,
      sector: 'Basic Materials', industry: 'Copper' },
  GOOGL: { cik: '0001652044', name: 'Alphabet Inc.',
      market_cap: 2100000000000,
      sector: 'Technology', industry: 'Internet Content & Information' },
  JNJ: { cik: '0000200406', name: 'Johnson & Johnson',
      market_cap: 380000000000,
      sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  JPM: { cik: '0000019617', name: 'JPMorgan Chase & Co.',
      market_cap: 600000000000,
      sector: 'Financial Services', industry: 'Banks - Diversified' },
  META: { cik: '0001326801', name: 'Meta Platforms Inc.',
      market_cap: 1500000000000,
      sector: 'Technology', industry: 'Internet Content & Information' },
  MSFT: { cik: '0000789019', name: 'Microsoft Corp.',
      market_cap: 3200000000000,
      sector: 'Technology', industry: 'Software - Infrastructure' },
  NVDA: { cik: '0001045810', name: 'NVIDIA Corp.',
      market_cap: 3000000000000,
      sector: 'Technology', industry: 'Semiconductors' },
  O: { cik: '0000726728', name: 'Realty Income Corp.',
      market_cap: 50000000000,
      sector: 'Real Estate', industry: 'REIT - Retail' },
  PLD: { cik: '0001045609', name: 'Prologis Inc.',
      market_cap: 110000000000,
      sector: 'Real Estate', industry: 'REIT - Industrial' },
  RIO: { cik: '0000863064', name: 'Rio Tinto Group',
      market_cap: 100000000000,
      sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  TSLA: { cik: '0001318605', name: 'Tesla Inc.',
      market_cap: 800000000000,
      sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  UNH: { cik: '0000731766', name: 'UnitedHealth Group Inc.',
      market_cap: 500000000000,
      sector: 'Healthcare', industry: 'Healthcare Plans' },
  WMT: { cik: '0000104169', name: 'Walmart Inc.',
      market_cap: 500000000000,
      sector: 'Consumer Defensive', industry: 'Discount Stores' },
  XOM: { cik: '0000034088', name: 'Exxon Mobil Corp.',
      market_cap: 500000000000,
      sector: 'Energy', industry: 'Oil & Gas Integrated' },
};

// ============================================================
// Breakdown extraction
// ============================================================

function breakdownToRows(breakdown: Record<string, unknown>): Array<{ name: string; value: number; score: number }> {
  const result: Array<{ name: string; value: number; score: number }> = [];
  for (const [key, val] of Object.entries(breakdown)) {
    if (
      typeof val === 'object' &&
      val !== null &&
      'value' in val &&
      'score' in val &&
      'available' in val
    ) {
      const v = val as { value: number | null; score: number; available: boolean };
      if (v.available && typeof v.value === 'number') {
        result.push({ name: key, value: v.value, score: v.score });
      }
    } else if (
      typeof val === 'object' &&
      val !== null &&
      'value' in val &&
      'score' in val
    ) {
      const v = val as { value: number; score: number };
      if (typeof v.value === 'number' && typeof v.score === 'number') {
        result.push({ name: key, value: v.value, score: v.score });
      }
    }
  }
  return result;
}

// ============================================================
// Generic seed pipeline
// ============================================================

export async function seedTicker(
  env: Env,
  ticker: string,
  _refresh: boolean = false,
): Promise<Response> {
  const upper = ticker.toUpperCase();
  const meta = COMPANY_META[upper];

  if (!meta) {
    return Response.json(
      { ok: false, error: `Unknown ticker: ${upper}. Add CIK mapping and company metadata.` },
      { status: 400 },
    );
  }

  try {
    console.log(`[seed] ${upper} — fetching SEC data...`);

    // 1. Fetch from SEC
    const rawFinancials = await secEdgarProvider.fetchFinancials({ ticker: upper });
    if (rawFinancials.length === 0) {
      return Response.json({ ok: false, error: `No financial data found for ${upper}` }, { status: 404 });
    }
    console.log(`[seed] ${upper} — ${rawFinancials.length} fiscal years found`);

    // 2. Normalize
    const normalized = defaultNormalizer.normalize(rawFinancials);
    if (normalized.warnings.length > 0) {
      console.log(`[seed] ${upper} — normalizer warnings: ${JSON.stringify(normalized.warnings)}`);
    }

    // 3. Validate financial data integrity (before D1 write)
    const validation = validateFinancials(normalized.financials);
    const validFinancials = filterValidFinancials(normalized.financials);
    const rejectedCount = normalized.financials.length - validFinancials.length;

    if (rejectedCount > 0) {
      console.log(`[seed] ${upper} — validation REJECTED ${rejectedCount} rows: ${validation.errors.join('; ')}`);
    }
    if (validation.warnings.length > 0) {
      console.log(`[seed] ${upper} — validation warnings: ${validation.warnings.join('; ')}`);
    }

    // 4. Upsert company
    await upsertCompany(env.DB, {
      ticker: upper,
      cik: meta.cik,
      name: meta.name,
      sector: meta.sector,
      industry: meta.industry,
      market_cap: meta.market_cap,
      updated_at: '',
    });

    // 5. Persist financials (only validated rows)
    await upsertFinancials(env.DB, validFinancials);

    // 6. Run engines (only validated rows)
    const input: EngineInput = {
      ticker: upper,
      financials: validFinancials,
      warnings: normalized.warnings,
      marketCap: meta.market_cap ?? 0,
    };

    const qualityResult = qualityEngine.calculate(input);
    const growthResult = growthEngine.calculate(input);

    // Load benchmarks for valuation
    const companySector = meta.sector;
    const benchmarks = await getBenchmarks(env.DB, companySector);
    const valuationInput: EngineInput = { ...input, benchmarks };
    const valuationResult = valuationEngine.calculate(valuationInput);

    const riskResult = riskEngine.calculate(input);

    // 7. Compute overall (Q=25%, G=25%, V=30%, R=20%)
    const overallScore = Math.round(
      qualityResult.score * 0.25 +
      growthResult.score * 0.25 +
      valuationResult.score * 0.30 +
      riskResult.score * 0.20,
    );

    // 8. Upsert metrics
    const metricRow: MetricRow = {
      ticker: upper,
      quality_score: qualityResult.score,
      growth_score: growthResult.score,
      valuation_score: valuationResult.score,
      risk_score: riskResult.score,
      overall_score: overallScore,
      consistency_score: 0,
      updated_at: '',
    };
    await upsertMetrics(env.DB, metricRow);

    // 8. Upsert breakdowns
    await upsertMetricDetails(env.DB, upper, 'quality', breakdownToRows(qualityResult.breakdown));
    await upsertMetricDetails(env.DB, upper, 'growth', breakdownToRows(growthResult.breakdown));
    await upsertMetricDetails(env.DB, upper, 'valuation', breakdownToRows(valuationResult.breakdown));
    await upsertMetricDetails(env.DB, upper, 'risk', breakdownToRows(riskResult.breakdown));

    // 9. Compute and persist proprietary factors
    const factors = computeAllFactors({ ticker: upper, financials: validFinancials });
    await upsertFactorScores(env.DB, upper, factors);

    // 10. Summary
    const yearsWithRevenue = validFinancials.filter((f) => f.revenue > 0).map((f) => f.fiscal_year);
    const latestYear = validFinancials[validFinancials.length - 1];

    console.log(`[seed] ${upper} — Q=${qualityResult.score} G=${growthResult.score} V=${valuationResult.score} R=${riskResult.score} O=${overallScore}`);

    return Response.json({
      ok: true,
      ticker: upper,
      name: meta.name,
      sector: meta.sector,
      industry: meta.industry,
      fiscalYears: validFinancials.length,
      rawCount: normalized.financials.length,
      rejectedCount,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      revenueYears: yearsWithRevenue,
      warnings: normalized.warnings,
      latest: latestYear ? {
        fiscalYear: latestYear.fiscal_year,
        revenue: latestYear.revenue,
        operatingIncome: latestYear.operating_income,
        netIncome: latestYear.net_income,
        ocf: latestYear.operating_cash_flow,
        fcf: latestYear.free_cash_flow,
        assets: latestYear.total_assets,
        shares: latestYear.shares_outstanding,
      } : null,
      scores: {
        quality: qualityResult.score,
        growth: growthResult.score,
        valuation: valuationResult.score,
        risk: riskResult.score,
        overall: overallScore,
      },
    });
  } catch (err) {
    console.error(`[seed] ${upper} — error:`, err);
    return Response.json(
      { ok: false, ticker: upper, error: String(err) },
      { status: 500 },
    );
  }
}
