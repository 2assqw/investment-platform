import { describe, it, expect } from 'vitest';
import { defaultNormalizer } from '../../src/normalizers/financial-normalizer';
import { growthEngine } from '../../src/engines/growth-engine';
import { makeFinancialRow, multiYearData } from '../helpers';
import { FinancialRow } from '../../src/types';

function makeRow(fiscalYear: number, shares: number, overrides: Partial<FinancialRow> = {}): FinancialRow {
  return makeFinancialRow({
    fiscal_year: fiscalYear,
    shares_outstanding: shares,
    ...overrides,
  });
}

describe('DefaultFinancialNormalizer', () => {
  it('returns financials unchanged for normal share counts', () => {
    const financials = [
      makeRow(2023, 1_000_000),
      makeRow(2024, 1_020_000), // 2% increase (buyback)
    ];
    const result = defaultNormalizer.normalize(financials);
    expect(result.warnings).toHaveLength(0);
    expect(result.financials).toEqual(financials);
  });

  it('no warnings for single year of data', () => {
    const result = defaultNormalizer.normalize([makeRow(2024, 1_000_000)]);
    expect(result.warnings).toHaveLength(0);
  });

  it('no warnings for empty financials', () => {
    const result = defaultNormalizer.normalize([]);
    expect(result.warnings).toHaveLength(0);
    expect(result.financials).toEqual([]);
  });

  it('detects 10x share increase (NVDA-style stock split)', () => {
    const financials = [
      makeRow(2023, 2_500_000_000, { revenue: 26_000_000_000, net_income: 4_300_000_000 }),
      makeRow(2024, 25_000_000_000, { revenue: 60_000_000_000, net_income: 29_000_000_000 }),
    ];
    const result = defaultNormalizer.normalize(financials);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual({
      type: 'possible_stock_split_detected',
      fiscalYear: 2024,
      ratio: 10,
    });
  });

  it('detects 4:1 split', () => {
    const financials = [
      makeRow(2020, 600_000_000),
      makeRow(2021, 2_400_000_000),
    ];
    const result = defaultNormalizer.normalize(financials);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.ratio).toBe(4);
  });

  it('detects reverse split (ratio < 0.67)', () => {
    const financials = [
      makeRow(2023, 10_000_000),
      makeRow(2024, 3_000_000), // 1:3 reverse split
    ];
    const result = defaultNormalizer.normalize(financials);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.ratio).toBe(0.3);
  });

  it('detects multiple splits across many years', () => {
    // NVDA: 4:1 in 2020, then 10:1 in 2024
    const financials = [
      makeRow(2019, 600_000_000),
      makeRow(2020, 2_400_000_000), // 4:1
      makeRow(2021, 2_500_000_000),
      makeRow(2022, 2_500_000_000),
      makeRow(2023, 2_500_000_000),
      makeRow(2024, 25_000_000_000), // 10:1
    ];
    const result = defaultNormalizer.normalize(financials);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]!.ratio).toBe(4);
    expect(result.warnings[1]!.ratio).toBe(10);
  });

  it('skips ratio check when either period has zero shares', () => {
    const financials = [
      makeRow(2023, 0),
      makeRow(2024, 1_000_000),
    ];
    const result = defaultNormalizer.normalize(financials);
    // Zero shares → data quality issue, not a split. Normalizer skips check.
    expect(result.warnings).toHaveLength(0);
  });

  it('sorts unsorted input by fiscal year before detection', () => {
    const financials = [
      makeRow(2024, 25_000_000_000),
      makeRow(2023, 2_500_000_000),
    ];
    const result = defaultNormalizer.normalize(financials);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.fiscalYear).toBe(2024); // 2024 had the jump
  });
});

describe('Growth Engine — warning propagation', () => {
  it('propagates split warning into EPS CAGR breakdown', () => {
    const financials = [
      makeRow(2020, 2_500_000_000, { revenue: 16_000_000_000, net_income: 4_000_000_000, free_cash_flow: 3_000_000_000 }),
      makeRow(2021, 2_500_000_000, { revenue: 26_000_000_000, net_income: 9_000_000_000, free_cash_flow: 5_000_000_000 }),
      makeRow(2022, 2_500_000_000, { revenue: 26_000_000_000, net_income: 9_000_000_000, free_cash_flow: 5_000_000_000 }),
      makeRow(2023, 25_000_000_000, { revenue: 60_000_000_000, net_income: 29_000_000_000, free_cash_flow: 25_000_000_000 }),
      makeRow(2024, 25_000_000_000, { revenue: 130_000_000_000, net_income: 72_000_000_000, free_cash_flow: 60_000_000_000 }),
    ];

    const warnings = [
      { type: 'possible_stock_split_detected' as const, fiscalYear: 2023, ratio: 10 },
    ];

    const result = growthEngine.calculate({
      ticker: 'TEST',
      financials,
      warnings,
    });

    const b = result.breakdown as Record<string, Record<string, unknown>>;
    expect(b.epsCagr!.warning).toBe('possible_stock_split_detected');
    // Revenue and FCF should NOT have the warning
    expect(b.revenueCagr!.warning).toBeUndefined();
    expect(b.fcfCagr!.warning).toBeUndefined();
  });

  it('ESG CAGR has no warning when no normalization warnings provided', () => {
    const financials = multiYearData(5);
    const result = growthEngine.calculate({
      ticker: 'TEST',
      financials,
    });

    const b = result.breakdown as Record<string, Record<string, unknown>>;
    expect(b.epsCagr!.warning).toBeUndefined();
  });

  it('ESG CAGR has no warning when split is outside CAGR window', () => {
    const financials = [
      makeRow(2019, 600_000_000, { revenue: 4_000_000_000, net_income: 400_000_000, free_cash_flow: 1_000_000_000 }),
      makeRow(2020, 2_400_000_000, { revenue: 10_000_000_000, net_income: 2_000_000_000, free_cash_flow: 3_000_000_000 }),
      makeRow(2021, 2_500_000_000, { revenue: 16_000_000_000, net_income: 4_000_000_000, free_cash_flow: 5_000_000_000 }),
      makeRow(2022, 2_500_000_000, { revenue: 26_000_000_000, net_income: 9_000_000_000, free_cash_flow: 8_000_000_000 }),
      makeRow(2023, 2_500_000_000, { revenue: 26_000_000_000, net_income: 9_000_000_000, free_cash_flow: 8_000_000_000 }),
    ];

    // Warning for FY2020 — outside the CAGR window (FY2022-FY2023)
    const warnings = [
      { type: 'possible_stock_split_detected' as const, fiscalYear: 2020, ratio: 4 },
    ];

    const result = growthEngine.calculate({
      ticker: 'TEST',
      financials,
      warnings,
    });

    const b = result.breakdown as Record<string, Record<string, unknown>>;
    // Split is at FY2020, CAGR uses sorted[0]=FY2023 and sorted[3]=FY2020
    // Wait — FY2020 is sorted[3], so the split IS in the CAGR window
    // Let me check... sorted[0]=2023, sorted[3]=2020, warning.fiscalYear=2020
    // 2020 > 2020? No, 2020 > 2020 is false. So warning is NOT triggered.
    // This is correct — the split happened AT the 3Y-ago year, not WITHIN.
    expect(b.epsCagr!.warning).toBeUndefined();
  });

  it('scoring is unchanged whether warnings are present or not', () => {
    const financials = multiYearData(5);
    const withWarnings = [{ type: 'possible_stock_split_detected' as const, fiscalYear: 2023, ratio: 10 }];

    const resultWithout = growthEngine.calculate({
      ticker: 'TEST',
      financials,
    });
    const resultWith = growthEngine.calculate({
      ticker: 'TEST',
      financials,
      warnings: withWarnings,
    });

    expect(resultWith.score).toBe(resultWithout.score);
    // All three CAGR values unchanged
    const b0 = resultWithout.breakdown as Record<string, { value: number; score: number }>;
    const b1 = resultWith.breakdown as Record<string, { value: number; score: number }>;
    expect(b1.revenueCagr!.value).toBe(b0.revenueCagr!.value);
    expect(b1.epsCagr!.value).toBe(b0.epsCagr!.value);
    expect(b1.fcfCagr!.value).toBe(b0.fcfCagr!.value);
  });
});
