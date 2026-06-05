import { describe, it, expect } from 'vitest';
import { qualityEngine } from '../../src/engines/quality-engine';
import { makeFinancialRow } from '../helpers';

describe('Quality Engine', () => {
  it('returns 0-100 score for valid financials', () => {
    const result = qualityEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow()],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns breakdown with all four metrics', () => {
    const result = qualityEngine.calculate({
      ticker: 'TEST',
      financials: [makeFinancialRow()],
    });
    const b = result.breakdown as Record<string, { value: number; score: number }>;
    expect(b.roe).toBeDefined();
    expect(b.roic).toBeDefined();
    expect(b.fcfMargin).toBeDefined();
    expect(b.debtRatio).toBeDefined();
  });

  it('returns 0 for empty financials', () => {
    const result = qualityEngine.calculate({ ticker: 'TEST', financials: [] });
    expect(result.score).toBe(0);
  });

  it('handles zero denominators gracefully', () => {
    const row = makeFinancialRow({
      shareholder_equity: 0,
      total_assets: 0,
      revenue: 0,
    });
    const result = qualityEngine.calculate({
      ticker: 'TEST',
      financials: [row],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('scores excellent company near 100', () => {
    const row = makeFinancialRow({
      revenue: 100_000,
      net_income: 50_000,        // ROE = 50%
      operating_income: 40_000,  // ROIC = 20%
      free_cash_flow: 30_000,   // FCF Margin = 30%
      total_liabilities: 10_000, // Debt Ratio = 5%
    });
    const result = qualityEngine.calculate({
      ticker: 'TEST',
      financials: [row],
    });
    expect(result.score).toBeGreaterThan(80);
  });

  it('scores poor company near 0', () => {
    const row = makeFinancialRow({
      net_income: 1_000,         // ROE = 1%
      operating_income: 500,     // ROIC < 1%
      free_cash_flow: 500,       // FCF Margin < 1%
      total_liabilities: 190_000, // Debt Ratio = 95%
    });
    const result = qualityEngine.calculate({
      ticker: 'TEST',
      financials: [row],
    });
    expect(result.score).toBeLessThan(30);
  });
});
