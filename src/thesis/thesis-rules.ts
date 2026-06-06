import { ThesisRule, ThesisContext } from './thesis-types';

export const THESIS_RULES: ThesisRule[] = [
  {
    name: 'High Quality Compounder',
    priority: 1,
    check: (c) => c.quality >= 80 && c.growthConsistency >= 80 && c.risk >= 70,
  },
  {
    name: 'Elite Growth Company',
    priority: 2,
    check: (c) => c.growth >= 80 && c.quality >= 70,
  },
  {
    name: 'Cash Flow Machine',
    priority: 3,
    check: (c) => c.cashConversion >= 80 && c.fcfMargin >= 20,
  },
  {
    name: 'Shareholder Friendly',
    priority: 4,
    check: (c) => c.shareholderAlignment >= 80,
  },
  {
    name: 'Deep Value Candidate',
    priority: 5,
    check: (c) => c.valuation >= 80 && c.quality >= 50,
  },
  {
    name: 'Cyclical Opportunity',
    priority: 6,
    check: (c) =>
      ['Basic Materials', 'Energy', 'Mining'].some(s => c.sector?.toLowerCase().includes(s.toLowerCase()) || c.industry?.toLowerCase().includes(s.toLowerCase())) &&
      c.valuation >= 70,
  },
  {
    name: 'Mature Franchise',
    priority: 7,
    check: (c) => c.quality >= 70 && c.growth < 30,
  },
  {
    name: 'Speculative Growth',
    priority: 8,
    check: (c) => c.growth >= 70 && c.risk < 50,
  },
];

export function getDefaultThesis(ctx: ThesisContext): string {
  if (ctx.industrySupport === 'FAIL') return 'Industry Model Not Supported';
  if (ctx.quality >= 70 && ctx.risk >= 60) return 'Solid Business';
  if (ctx.growth >= 50) return 'Growth Story';
  if (ctx.valuation >= 60) return 'Value Play';
  return 'Unclassified';
}
