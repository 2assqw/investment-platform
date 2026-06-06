export interface Opportunity {
  ticker: string;
  type: string;
  message: string;
  impact: 'positive' | 'negative' | 'neutral';
  createdAt: string;
}

export interface OpportunityResult {
  count: number;
  results: Opportunity[];
}
