import { DataProvider, FetchFinancialsRequest, FetchPriceRequest, PriceData } from './types';
import { FinancialRow } from '../types';

/**
 * SEC EDGAR provider stub.
 * Swap with a real implementation (FMP, Polygon, or direct XBRL parser).
 */
export const secEdgarProvider: DataProvider = {
  name: 'sec-edgar',

  async fetchFinancials(_req: FetchFinancialsRequest): Promise<FinancialRow[]> {
    throw new Error(
      'SEC EDGAR provider not implemented. Swap with a concrete provider (FMP, Polygon, etc.).',
    );
  },

  async fetchPrice(_req: FetchPriceRequest): Promise<PriceData> {
    throw new Error(
      'SEC EDGAR provider does not support price data. Use a market data provider.',
    );
  },

  async fetchAllTickers(): Promise<string[]> {
    throw new Error(
      'fetchAllTickers not implemented. Provide a ticker list or use a data provider API.',
    );
  },
};
