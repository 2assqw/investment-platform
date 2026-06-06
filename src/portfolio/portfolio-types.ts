export interface PortfolioHolding {
  ticker: string;
  company: string;
  sector: string;
  weight: number;
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  overall: number;
  trust: number;
}

export interface PortfolioMetrics {
  averageQuality: number;
  averageGrowth: number;
  averageValuation: number;
  averageRisk: number;
  averageTrust: number;
  sectorCount: number;
  concentrationRisk: number;
}

export interface Portfolio {
  name: string;
  description: string;
  holdings: PortfolioHolding[];
  metrics: PortfolioMetrics;
}

export interface PortfolioHealth {
  diversification: number;
  sectorRisk: number;
  concentrationRisk: number;
  trustScore: number;
}
