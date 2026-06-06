export interface RankingEntry {
  rank: number;
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  overall: number;
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  growthConsistency: number;
  shareholderAlignment: number;
  cashConversion: number;
  trust: number;
  warningCount: number;
  industrySupport: string;
}

export interface RankingResponse {
  generatedAt: string;
  count: number;
  results: RankingEntry[];
}

export interface ScreenParams {
  sector?: string;
  industry?: string;
  overallMin?: number;
  qualityMin?: number;
  growthMin?: number;
  valuationMin?: number;
  riskMin?: number;
  trustMin?: number;
  growthConsistencyMin?: number;
  shareholderAlignmentMin?: number;
  cashConversionMin?: number;
  includeUnsupported?: boolean;
  limit?: number;
}

export interface DiscoverResponse {
  generatedAt: string;
  highQuality: RankingEntry[];
  highGrowth: RankingEntry[];
  highValue: RankingEntry[];
  shareholderFriendly: RankingEntry[];
  cashMachines: RankingEntry[];
  consistentCompounders: RankingEntry[];
}
