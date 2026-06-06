const BASE = 'https://2assqw.cc';

export interface CompanyScore {
  ticker: string;
  industrySupport: { level: string; reason: string | null };
  warnings: string[];
  scores: { quality: number; growth: number; valuation: number; risk: number; overall: number };
  updatedAt: string;
}

export interface CompanyMetrics extends CompanyScore {
  breakdown: Record<string, Record<string, { value: number; score: number }>>;
}

export interface CompanyExplain extends CompanyScore {
  contributions: { quality: number; growth: number; valuation: number; risk: number };
  factorContributions: Record<string, { score: number; impact: number; label: string }>;
  strengths: string[];
  weaknesses: string[];
  trust: { score: number; level: string };
}

export interface RankingEntry {
  rank: number; ticker: string; company: string; sector: string; industry: string;
  overall: number; quality: number; growth: number; valuation: number; risk: number;
  trust: number; warningCount: number; industrySupport: string;
}

export interface DiscoverData {
  highQuality: RankingEntry[];
  highGrowth: RankingEntry[];
  highValue: RankingEntry[];
  shareholderFriendly: RankingEntry[];
  cashMachines: RankingEntry[];
  consistentCompounders: RankingEntry[];
}

export interface ScreenerParams {
  sector?: string; overallMin?: number; qualityMin?: number;
  growthMin?: number; valuationMin?: number; riskMin?: number;
}

export interface WatchlistItem {
  ticker: string; targetOverall?: number; targetValuation?: number;
  targetQuality?: number; targetGrowth?: number;
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  company: (ticker: string) => fetchApi<CompanyScore>(`/api/company/${ticker}`),
  metrics: (ticker: string) => fetchApi<CompanyMetrics>(`/api/metrics/${ticker}`),
  explain: (ticker: string) => fetchApi<CompanyExplain>(`/api/explain/${ticker}`),
  rankings: (type: string) => fetchApi<{ count: number; results: RankingEntry[] }>(`/api/rankings/top-${type}`),
  discover: () => fetchApi<DiscoverData>('/api/discover'),
  screener: (params: ScreenerParams) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) q.set(k, String(v)); });
    return fetchApi<{ count: number; results: RankingEntry[] }>(`/api/screener?${q.toString()}`);
  },
  watchlist: {
    get: () => fetchApi<{ count: number; items: WatchlistItem[] }>('/api/watchlist'),
  },
};
