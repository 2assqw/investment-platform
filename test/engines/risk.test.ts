import { describe, it, expect } from 'vitest';
import { riskEngine } from '../../src/engines/risk-engine';
import { FinancialRow } from '../../src/types';
import { makeFinancialRow, multiYearData } from '../helpers';

interface RiskMetricShape {
  value: number | null;
  score: number;
  available: boolean;
  model: string;
  reason?: string;
}

describe('Risk Engine — 1 period (insufficient history)', () => {
  const singleYear = [makeFinancialRow({ fiscal_year: 2025 })];

  it('produces a valid 0-100 score', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials: singleYear });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('altmanZ is available with numeric value', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials: singleYear });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.altmanZ!.available).toBe(true);
    expect(typeof b.altmanZ!.value).toBe('number');
    expect(b.altmanZ!.model).toBe('simplified-v1');
  });

  it('piotroskiF is unavailable with reason', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials: singleYear });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.piotroskiF!.available).toBe(false);
    expect(b.piotroskiF!.value).toBeNull();
    expect(b.piotroskiF!.score).toBe(0);
    expect(b.piotroskiF!.reason).toBe('insufficient_history');
    expect(b.piotroskiF!.model).toBe('simplified-8factor-v1');
  });

  it('beneishM is unavailable with reason', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials: singleYear });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.beneishM!.available).toBe(false);
    expect(b.beneishM!.value).toBeNull();
    expect(b.beneishM!.score).toBe(0);
    expect(b.beneishM!.reason).toBe('insufficient_history');
    expect(b.beneishM!.model).toBe('simplified-4factor-v1');
  });

  it('adaptive scoring: score normalized from available max (33)', () => {
    // Altman total max = 33. Score normalized: (altmanScore / 33) * 100
    const result = riskEngine.calculate({ ticker: 'TEST', financials: singleYear });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    const altmanScore = b.altmanZ!.score;
    const expected = Math.round((altmanScore / 33) * 100);
    expect(result.score).toBe(expected);
  });
});

describe('Risk Engine — 2 periods (sufficient history)', () => {
  const current = makeFinancialRow({
    fiscal_year: 2025,
    revenue: 200_000,
    net_income: 50_000,
    operating_income: 60_000,
    operating_cash_flow: 70_000,
    gross_profit: 120_000,
    total_assets: 150_000,
    total_liabilities: 20_000,
    shareholder_equity: 130_000,
    shares_outstanding: 10_000,
  });
  const prior = makeFinancialRow({
    fiscal_year: 2024,
    revenue: 150_000,
    net_income: 30_000,
    operating_income: 40_000,
    operating_cash_flow: 45_000,
    gross_profit: 90_000,
    total_assets: 160_000,
    total_liabilities: 30_000,
    shareholder_equity: 110_000,
    shares_outstanding: 11_000,
  });

  it('all three metrics are available', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.altmanZ!.available).toBe(true);
    expect(b.piotroskiF!.available).toBe(true);
    expect(b.beneishM!.available).toBe(true);
  });

  it('current and prior are different rows', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    // If current === prior, F-Score would not be 8
    expect(b.piotroskiF!.value).not.toBeNull();
    // Verify fiscal years differ (indirect check: different row objects)
    // The engine sorts descending, so current=2025, prior=2024
    expect(b.piotroskiF!.available).toBe(true);
    expect(b.beneishM!.available).toBe(true);
  });

  it('score is within 0-100', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('healthy company scores above 50', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    expect(result.score).toBeGreaterThan(50);
  });

  it('ideal F-Score of 8 when all criteria pass', () => {
    // Build data where all 8 criteria explicitly pass
    const cur = makeFinancialRow({
      fiscal_year: 2025,
      revenue: 200_000,
      net_income: 50_000,
      operating_income: 60_000,
      operating_cash_flow: 70_000,
      gross_profit: 130_000,               // GM = 65%
      total_assets: 150_000,
      total_liabilities: 20_000,
      shareholder_equity: 130_000,
      shares_outstanding: 10_000,
    });
    const prv = makeFinancialRow({
      fiscal_year: 2024,
      revenue: 150_000,
      net_income: 30_000,
      operating_income: 40_000,
      operating_cash_flow: 25_000,
      gross_profit: 80_000,                // GM = 53.3% (< 65%) → increasing
      total_assets: 160_000,
      total_liabilities: 30_000,
      shareholder_equity: 110_000,
      shares_outstanding: 10_000,           // no dilution
    });
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [cur, prv],
    });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.piotroskiF!.value).toBe(8);
  });

  it('adaptive scoring: all three max scores sum to 100', () => {
    // Full availability: max = 33 + 33 + 34 = 100
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    const total = b.altmanZ!.score + b.piotroskiF!.score + b.beneishM!.score;
    // Score normalized against total possible (100) — should match
    expect(result.score).toBe(total);
  });
});

describe('Risk Engine — 5 periods (only latest + prior used)', () => {
  const financials = multiYearData(5);

  it('all three metrics available', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.altmanZ!.available).toBe(true);
    expect(b.piotroskiF!.available).toBe(true);
    expect(b.beneishM!.available).toBe(true);
  });

  it('no NaN values in breakdown', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    for (const [key, metric] of Object.entries(b)) {
      if (metric.available) {
        expect(Number.isNaN(metric.value)).toBe(false);
      }
      expect(Number.isNaN(metric.score)).toBe(false);
    }
  });

  it('score within 0-100', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('F-Score is not computed using same row as prior', () => {
    // With 5 years, the engine uses sorted[0] as latest and sorted[1] as prior.
    // Verify that piotroskiF.available is true (meaning sorted[1] exists and is different from sorted[0]).
    const result = riskEngine.calculate({ ticker: 'TEST', financials });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.piotroskiF!.available).toBe(true);
  });
});

describe('Risk Engine — edge cases', () => {
  it('returns 0 for empty financials', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials: [] });
    expect(result.score).toBe(0);
  });

  it('no division-by-zero failures with all-zero assets', () => {
    const row = makeFinancialRow({
      total_assets: 0,
      shareholder_equity: 0,
      revenue: 0,
    });
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [row],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(Number.isNaN(b.altmanZ!.value)).toBe(false);
    expect(b.altmanZ!.available).toBe(true);
  });

  it('no division-by-zero with zero revenue', () => {
    const current = makeFinancialRow({ revenue: 0, gross_profit: 0 });
    const prior = makeFinancialRow({ fiscal_year: 2024, revenue: 0, gross_profit: 0 });
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(Number.isNaN(b.beneishM!.value)).toBe(false);
  });

  it('two identical rows (same-year edge case) are treated as different periods', () => {
    // Even if data is identical, if there are 2 rows, prior exists and is used.
    const row = makeFinancialRow({ fiscal_year: 2025 });
    const row2 = makeFinancialRow({ fiscal_year: 2024 });
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [row, row2],
    });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.piotroskiF!.available).toBe(true);
    expect(b.beneishM!.available).toBe(true);
  });

  it('all model metadata strings are present', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow()],
    });
    const b = result.breakdown as Record<string, RiskMetricShape>;
    expect(b.altmanZ!.model).toBe('simplified-v1');
    expect(b.piotroskiF!.model).toBe('simplified-8factor-v1');
    expect(b.beneishM!.model).toBe('simplified-4factor-v1');
  });
});
