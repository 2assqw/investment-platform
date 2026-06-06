export interface BenchmarkTicker {
  ticker: string;
  sector: string;
  industry: string;
}

export const BENCHMARK_UNIVERSE: BenchmarkTicker[] = [
  // Technology (4)
  { ticker: 'NVDA', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'MSFT', sector: 'Technology', industry: 'Software - Infrastructure' },
  { ticker: 'META', sector: 'Technology', industry: 'Internet Content & Information' },
  { ticker: 'AAPL', sector: 'Technology', industry: 'Consumer Electronics' },
  { ticker: 'GOOGL', sector: 'Technology', industry: 'Internet Content & Information' },
  { ticker: 'AMZN', sector: 'Consumer Cyclical', industry: 'Internet Retail' },

  // Energy (2)
  { ticker: 'XOM', sector: 'Energy', industry: 'Oil & Gas Integrated' },
  { ticker: 'CVX', sector: 'Energy', industry: 'Oil & Gas Integrated' },

  // Materials (2)
  { ticker: 'FCX', sector: 'Basic Materials', industry: 'Copper' },
  { ticker: 'RIO', sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },

  // Financial (2)
  { ticker: 'JPM', sector: 'Financial Services', industry: 'Banks - Diversified' },
  { ticker: 'BAC', sector: 'Financial Services', industry: 'Banks - Diversified' },

  // REIT (2)
  { ticker: 'O', sector: 'Real Estate', industry: 'REIT - Retail' },
  { ticker: 'PLD', sector: 'Real Estate', industry: 'REIT - Industrial' },

  // Consumer (2)
  { ticker: 'COST', sector: 'Consumer Defensive', industry: 'Discount Stores' },
  { ticker: 'WMT', sector: 'Consumer Defensive', industry: 'Discount Stores' },

  // Healthcare (2)
  { ticker: 'UNH', sector: 'Healthcare', industry: 'Healthcare Plans' },
  { ticker: 'JNJ', sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
];
