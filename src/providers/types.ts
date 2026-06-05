import { FinancialRow } from '../types';

export interface FetchFinancialsRequest {
  ticker: string;
  fiscalYear?: number;
}

export interface FetchPriceRequest {
  ticker: string;
}

export interface PriceData {
  ticker: string;
  price: number;
  marketCap: number;
}

export interface DataProvider {
  readonly name: string;
  fetchFinancials(req: FetchFinancialsRequest): Promise<FinancialRow[]>;
  fetchPrice(req: FetchPriceRequest): Promise<PriceData>;
  fetchAllTickers(): Promise<string[]>;
}
