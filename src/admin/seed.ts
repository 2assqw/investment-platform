import { secEdgarProvider } from '../providers';
import { qualityEngine, growthEngine, riskEngine } from '../engines';
import { EngineInput } from '../engines/types';
import { defaultNormalizer } from '../normalizers';
import {
  upsertCompany,
  upsertFinancials,
  upsertMetrics,
  upsertMetricDetails,
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
}

const COMPANY_META: Record<string, CompanyMeta> = {
  AAPL: { cik: '0000320193', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics' },
  AMZN: { cik: '0001018724', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  BAC: { cik: '0000070858', name: 'Bank of America Corp.', sector: 'Financial Services', industry: 'Banks - Diversified' },
  FCX: { cik: '0000831259', name: 'Freeport-McMoRan Inc.', sector: 'Basic Materials', industry: 'Copper' },
  GOOGL: { cik: '0001652044', name: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet Content & Information' },
  JPM: { cik: '0000019617', name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Banks - Diversified' },
  META: { cik: '0001326801', name: 'Meta Platforms Inc.', sector: 'Technology', industry: 'Internet Content & Information' },
  MSFT: { cik: '0000789019', name: 'Microsoft Corp.', sector: 'Technology', industry: 'Software - Infrastructure' },
  NVDA: { cik: '0001045810', name: 'NVIDIA Corp.', sector: 'Technology', industry: 'Semiconductors' },
  O: { cik: '0000726728', name: 'Realty Income Corp.', sector: 'Real Estate', industry: 'REIT - Retail' },
  PLD: { cik: '0001045609', name: 'Prologis Inc.', sector: 'Real Estate', industry: 'REIT - Industrial' },
  TSLA: { cik: '0001318605', name: 'Tesla Inc.', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  XOM: { cik: '0000034088', name: 'Exxon Mobil Corp.', sector: 'Energy', industry: 'Oil & Gas Integrated' },
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
      console.log(`[seed] ${upper} — warnings: ${JSON.stringify(normalized.warnings)}`);
    }

    // 3. Upsert company
    await upsertCompany(env.DB, {
      ticker: upper,
      cik: meta.cik,
      name: meta.name,
      sector: meta.sector,
      industry: meta.industry,
      market_cap: 0,
      updated_at: '',
    });

    // 4. Persist financials
    await upsertFinancials(env.DB, normalized.financials);

    // 5. Run engines
    const input: EngineInput = {
      ticker: upper,
      financials: normalized.financials,
      warnings: normalized.warnings,
    };
    const qualityResult = qualityEngine.calculate(input);
    const growthResult = growthEngine.calculate(input);
    const riskResult = riskEngine.calculate(input);

    // 6. Compute overall (valuation = 0)
    const qualityScore = qualityResult.score;
    const growthScore = growthResult.score;
    const valuationScore = 0;
    const riskScore = riskResult.score;
    const overallScore = Math.round(
      qualityScore * 0.30 + growthScore * 0.30 + riskScore * 0.20,
    ) / 0.8;

    // 7. Upsert metrics
    const metricRow: MetricRow = {
      ticker: upper,
      quality_score: qualityScore,
      growth_score: growthScore,
      valuation_score: valuationScore,
      risk_score: riskScore,
      overall_score: overallScore,
      consistency_score: 0,
      updated_at: '',
    };
    await upsertMetrics(env.DB, metricRow);

    // 8. Upsert breakdowns
    await upsertMetricDetails(env.DB, upper, 'quality', breakdownToRows(qualityResult.breakdown));
    await upsertMetricDetails(env.DB, upper, 'growth', breakdownToRows(growthResult.breakdown));
    await upsertMetricDetails(env.DB, upper, 'risk', breakdownToRows(riskResult.breakdown));

    // 9. Summary
    const yearsWithRevenue = normalized.financials.filter((f) => f.revenue > 0).map((f) => f.fiscal_year);
    const latestYear = normalized.financials[normalized.financials.length - 1];

    console.log(`[seed] ${upper} — Q=${qualityScore} G=${growthScore} R=${riskScore} O=${overallScore}`);

    return Response.json({
      ok: true,
      ticker: upper,
      name: meta.name,
      sector: meta.sector,
      industry: meta.industry,
      fiscalYears: normalized.financials.length,
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
        quality: qualityScore,
        growth: growthScore,
        valuation: valuationScore,
        risk: riskScore,
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
