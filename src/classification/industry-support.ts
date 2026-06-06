import { SupportLevel, IndustrySupport } from './types';

// ============================================================
// Industry → Support Level registry
// ============================================================

interface SupportRule {
  sectors: string[];
  industries: string[];
  level: SupportLevel;
  reason: string | null;
}

const RULES: SupportRule[] = [
  // PASS — fully supported
  {
    sectors: ['Technology'],
    industries: ['Semiconductors', 'Software - Infrastructure', 'Internet Content & Information', 'Consumer Electronics'],
    level: 'PASS',
    reason: null,
  },
  {
    sectors: ['Communication Services'],
    industries: ['Internet Content & Information'],
    level: 'PASS',
    reason: null,
  },

  // WARNING — partially supported
  {
    sectors: ['Energy'],
    industries: [],
    level: 'WARNING',
    reason: 'energy_sector_cyclical',
  },
  {
    sectors: ['Basic Materials'],
    industries: [],
    level: 'WARNING',
    reason: 'materials_sector_cyclical',
  },
  {
    sectors: ['Consumer Cyclical'],
    industries: [],
    level: 'WARNING',
    reason: 'consumer_cyclical_model_limited',
  },
  {
    sectors: ['Industrials'],
    industries: [],
    level: 'WARNING',
    reason: 'industrial_sector_untested',
  },
  {
    sectors: ['Healthcare'],
    industries: [],
    level: 'WARNING',
    reason: 'healthcare_sector_untested',
  },

  // FAIL — fundamentally incompatible
  {
    sectors: ['Financial Services'],
    industries: [],
    level: 'FAIL',
    reason: 'banking_model_not_supported',
  },
  {
    sectors: ['Real Estate'],
    industries: [],
    level: 'FAIL',
    reason: 'reit_model_not_supported',
  },
  {
    sectors: ['Insurance'],
    industries: [],
    level: 'FAIL',
    reason: 'insurance_model_not_supported',
  },
];

const DEFAULT: SupportRule = {
  sectors: [],
  industries: [],
  level: 'WARNING',
  reason: 'sector_untested',
};

// ============================================================
// Resolution
// ============================================================

function matchesRule(rule: SupportRule, sector: string, industry: string): boolean {
  const sectorMatch = rule.sectors.length === 0 || rule.sectors.some(
    (s) => s.toLowerCase() === sector.toLowerCase(),
  );
  const industryMatch = rule.industries.length === 0 || rule.industries.some(
    (i) => i.toLowerCase() === industry.toLowerCase(),
  );
  return sectorMatch && (rule.industries.length === 0 || industryMatch);
}

/**
 * Returns the support level for a given sector + industry combination.
 * Checks exact sector match first, then industry match, then falls back.
 */
export function getIndustrySupport(sector: string, industry: string): IndustrySupport {
  // Find exact sector match
  for (const rule of RULES) {
    if (matchesRule(rule, sector, industry)) {
      return { level: rule.level, reason: rule.reason };
    }
  }

  return { level: DEFAULT.level, reason: DEFAULT.reason };
}

/**
 * Returns a flat map of sector → { level, reason } for admin reporting.
 */
export function getSupportSummary(): Record<string, { level: SupportLevel; reason: string | null }> {
  const seen = new Set<string>();
  const result: Record<string, { level: SupportLevel; reason: string | null }> = {};

  for (const rule of RULES) {
    for (const sector of rule.sectors) {
      const key = sector.toLowerCase().replace(/\s+/g, '_');
      if (!seen.has(key)) {
        seen.add(key);
        result[key] = { level: rule.level, reason: rule.reason };
      }
    }
  }

  return result;
}
