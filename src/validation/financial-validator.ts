import { FinancialRow } from '../types';
import { safeDivide } from '../engines/scoring';

// ============================================================
// Types
// ============================================================

export interface FinancialValidationDetail {
  fiscalYear: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FinancialValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: FinancialValidationDetail[];
  rejected: number[]; // fiscal years that failed critical validation
}

// ============================================================
// Constants
// ============================================================

const DEBT_RATIO_WARN = 500;    // >500% suspicious
const ROE_WARN = 300;           // >300% suspicious
const ROIC_WARN = 300;          // >300% suspicious
const REVENUE_GROWTH_WARN = 500; // >500% YoY suspicious
const ASSET_DROP_WARN = 0.8;    // >80% YoY drop suspicious

// ============================================================
// Required field checks (critical = row rejected if fails)
// ============================================================

function checkRequired(row: FinancialRow): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(row.total_assets) || row.total_assets <= 0) {
    errors.push('invalid_total_assets');
  }
  if (!Number.isFinite(row.revenue) || row.revenue <= 0) {
    errors.push('invalid_revenue');
  }
  if (!Number.isFinite(row.shares_outstanding) || row.shares_outstanding <= 0) {
    errors.push('invalid_share_count');
  }
  if (!Number.isFinite(row.total_liabilities) || row.total_liabilities < 0) {
    errors.push('invalid_liabilities');
  }
  if (!Number.isFinite(row.operating_cash_flow)) {
    errors.push('missing_operating_cash_flow');
  }
  if (!Number.isFinite(row.net_income)) {
    errors.push('missing_net_income');
  }

  return errors;
}

// ============================================================
// Anomaly checks (warning = suspicious but not rejected)
// ============================================================

function checkAnomalies(current: FinancialRow, prior: FinancialRow | null): string[] {
  const warnings: string[] = [];

  const debtRatio = safeDivide(current.total_liabilities, current.total_assets) * 100;
  if (Number.isFinite(debtRatio) && debtRatio > DEBT_RATIO_WARN) {
    warnings.push('suspicious_debt_ratio');
  }

  const roe = safeDivide(current.net_income, current.shareholder_equity) * 100;
  if (Number.isFinite(roe) && Math.abs(roe) > ROE_WARN) {
    warnings.push('suspicious_roe');
  }

  const roic = safeDivide(current.operating_income, current.total_assets) * 100;
  if (Number.isFinite(roic) && Math.abs(roic) > ROIC_WARN) {
    warnings.push('suspicious_roic');
  }

  // YoY checks require prior period
  if (prior) {
    if (prior.revenue > 0) {
      const revGrowth = safeDivide(current.revenue - prior.revenue, prior.revenue) * 100;
      if (Number.isFinite(revGrowth) && Math.abs(revGrowth) > REVENUE_GROWTH_WARN) {
        warnings.push('suspicious_revenue_growth');
      }
    }

    if (prior.total_assets > 0) {
      const assetChange = safeDivide(current.total_assets - prior.total_assets, prior.total_assets);
      if (Number.isFinite(assetChange) && assetChange < -ASSET_DROP_WARN) {
        warnings.push('suspicious_asset_change');
      }
    }
  }

  return warnings;
}

// ============================================================
// Main validation
// ============================================================

export function validateFinancials(financials: FinancialRow[]): FinancialValidationResult {
  const sorted = [...financials].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const details: FinancialValidationDetail[] = [];
  const rejected: number[] = [];
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const prior = i > 0 ? sorted[i - 1]! : null;

    const errors = checkRequired(row);
    const warnings = checkAnomalies(row, prior);

    const valid = errors.length === 0;

    details.push({
      fiscalYear: row.fiscal_year,
      valid,
      errors,
      warnings,
    });

    if (!valid) {
      rejected.push(row.fiscal_year);
      allErrors.push(`FY${row.fiscal_year}: ${errors.join(', ')}`);
    }
    if (warnings.length > 0) {
      allWarnings.push(`FY${row.fiscal_year}: ${warnings.join(', ')}`);
    }
  }

  return {
    valid: rejected.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    details,
    rejected,
  };
}

/**
 * Filters out invalid rows. Returns only rows that pass critical validation.
 */
export function filterValidFinancials(financials: FinancialRow[]): FinancialRow[] {
  const result = validateFinancials(financials);
  if (result.valid) return financials;
  return financials.filter((f) => !result.rejected.includes(f.fiscal_year));
}
