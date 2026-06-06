export interface WatchlistEntry {
  id: number;
  user_id: string;
  ticker: string;
  target_overall: number | null;
  target_valuation: number | null;
  target_quality: number | null;
  target_growth: number | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistAlert {
  ticker: string;
  reason: string;
  currentOverall: number;
  targetOverall: number;
}
