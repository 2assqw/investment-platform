import { describe, it, expect } from 'vitest';
import { riskEngine } from '../../src/engines/risk-engine';
import { makeFinancialRow } from '../helpers';

describe('Risk Engine', () => {
  it('returns 0-100 score', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow(), makeFinancialRow({ fiscal_year: 2024 })],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns breakdown with altmanZ, piotroskiF, beneishM', () => {
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow(), makeFinancialRow({ fiscal_year: 2024 })],
    });
    const b = result.breakdown as Record<string, { value: number; score: number }>;
    expect(b.altmanZ).toBeDefined();
    expect(b.piotroskiF).toBeDefined();
    expect(b.beneishM).toBeDefined();
  });

  it('returns 0 for empty financials', () => {
    const result = riskEngine.calculate({ ticker: 'TEST', financials: [] });
    expect(result.score).toBe(0);
  });

  it('gives high score to financially healthy company (high Z, high F, low M)', () => {
    const current = makeFinancialRow({
      revenue: 200_000,
      net_income: 50_000,
      operating_income: 60_000,
      operating_cash_flow: 70_000,
      gross_profit: 120_000,
      total_assets: 150_000,
      total_liabilities: 20_000,
      shareholder_equity: 130_000,
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
      shares_outstanding: 11_000, // More shares prior = no dilution
    });
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    expect(result.score).toBeGreaterThan(50);
  });

  it('gives F-Score of 8 for ideal scenario', () => {
    const current = makeFinancialRow({
      revenue: 200_000,
      net_income: 50_000,
      operating_cash_flow: 70_000,
      gross_profit: 120_000,
      total_assets: 150_000,
      total_liabilities: 20_000,
    });
    const prior = makeFinancialRow({
      fiscal_year: 2024,
      revenue: 150_000,
      net_income: 30_000,
      operating_cash_flow: 25_000,
      gross_profit: 80_000,
      total_assets: 160_000,
      total_liabilities: 30_000,
      shares_outstanding: 10_000,
    });
    const result = riskEngine.calculate({
      ticker: 'TEST',
      financials: [current, prior],
    });
    const b = result.breakdown as Record<string, { value: number; score: number }>;
    // All 8 F-Score criteria should pass
    expect(b.piotroskiF!.value).toBe(8);
  });
});
