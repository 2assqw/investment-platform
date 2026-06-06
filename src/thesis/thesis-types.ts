export interface ThesisResult {
  ticker: string;
  primaryThesis: string | null;
  secondaryTheses: string[];
  confidence: number;
  strengths: string[];
  risks: string[];
}

export interface ResearchSummary {
  ticker: string;
  overall: number;
  thesis: string | null;
  summary: Record<string, string>;
  strengths: string[];
  weaknesses: string[];
  trend: { direction: string; change: number } | null;
}

export interface ThesesByCategory {
  compounders: Array<{ ticker: string; confidence: number }>;
  eliteGrowth: Array<{ ticker: string; confidence: number }>;
  cashMachines: Array<{ ticker: string; confidence: number }>;
  shareholderFriendly: Array<{ ticker: string; confidence: number }>;
  deepValue: Array<{ ticker: string; confidence: number }>;
}

export interface ThesisRule {
  name: string;
  check: (ctx: ThesisContext) => boolean;
  priority: number; // lower = primary
}

export interface ThesisContext {
  ticker: string;
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  overall: number;
  growthConsistency: number;
  shareholderAlignment: number;
  cashConversion: number;
  fcfMargin: number;
  industrySupport: string;
  sector: string;
  industry: string;
  warningCount: number;
}
