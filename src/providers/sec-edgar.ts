import { DataProvider, FetchFinancialsRequest, FetchPriceRequest, PriceData } from './types';
import { FinancialRow } from '../types';

// ============================================================
// CIK lookup (SEC uses CIK, not ticker)
// ============================================================

const HARDCODED_CIK: Record<string, string> = {
  AAPL: '0000320193', AMZN: '0001018724', BAC: '0000070858', COST: '0000909832',
  CVX: '0000093410', FCX: '0000831259', GOOGL: '0001652044', JNJ: '0000200406',
  JPM: '0000019617', META: '0001326801', MSFT: '0000789019', NVDA: '0001045810',
  O: '0000726728', PLD: '0001045609', RIO: '0000863064', TSLA: '0001318605',
  UNH: '0000731766', WMT: '0000104169', XOM: '0000034088',
  BRK_B: '0001067983', LLY: '0000059478', AVGO: '0001730168',
  MA: '0001141391', HD: '0000354950', PG: '0000080424', ABBV: '0001551152',
  KO: '0000021344', PEP: '0000077474', TMO: '0000097745', CSCO: '0000858877',
  ORCL: '0001341439', ACN: '0001467373', CRM: '0001108524', IBM: '0000051143',
  DIS: '0001744489', CMCSA: '0001166691', T: '0000732717', VZ: '0000732712',
  NEE: '0000753308', SO: '0000092122', DUK: '0001326160', CAT: '0000018230',
  BA: '0000012927', GE: '0000040545', LMT: '0000936468', RTX: '0000101829',
  SPGI: '0000064040', MMC: '0000062709', AXP: '0000004962', GS: '0000886982',
  MS: '0000895421', BLK: '0001364742', C: '0000831001', PNC: '0000713676',
  USB: '000036104', SCHW: '0000316709',
};

let DYNAMIC_CIK: Record<string, string> | null = null;

async function loadDynamicCIK(): Promise<Record<string, string>> {
  if (DYNAMIC_CIK) return DYNAMIC_CIK;
  try {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'investment-platform/1.0 contact@example.com' },
    });
    const data = await res.json() as Record<string, { ticker: string; cik_str: number }>;
    DYNAMIC_CIK = {};
    for (const [, v] of Object.entries(data)) {
      DYNAMIC_CIK[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, '0');
    }
  } catch { /* use hardcoded only */ }
  return DYNAMIC_CIK ?? {};
}

function getCIK(ticker: string): string | null {
  return HARDCODED_CIK[ticker.toUpperCase()] ?? DYNAMIC_CIK?.[ticker.toUpperCase()] ?? null;
}

function padCIK(cik: string): string {
  return `CIK${cik}`;
}

// ============================================================
// XBRL tag → FinancialRow field mapping (tried in order)
// ============================================================

const TAG_MAP: Record<string, string[]> = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomer',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
  ],
  gross_profit: ['GrossProfit'],
  operating_income: ['OperatingIncomeLoss'],
  net_income: ['NetIncomeLoss', 'ProfitLoss'],
  operating_cash_flow: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: [
    'PaymentsToAcquireProductiveAssets',
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsForCapitalExpenditures',
  ],
  total_assets: ['Assets'],
  total_liabilities: ['Liabilities', 'LiabilitiesAndStockholdersEquity'],
  shareholder_equity: [
    'StockholdersEquity',
    'EquityAttributableToParent',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'ShareholdersEquity',
  ],
  shares_outstanding: [
    'WeightedAverageNumberOfDilutedSharesOutstanding',
    'WeightedAverageNumberOfSharesOutstandingBasic',
    'WeightedAverageNumberOfBasicSharesOutstanding',
    'CommonStockSharesOutstanding',
    'EntityCommonStockSharesOutstanding',
  ],
};

// ============================================================
// XBRL data shapes
// ============================================================

interface XBRLFact {
  filed: string;
  fy: number;
  fp: string;
  form: string;
  val: number;
  frame?: string;
  start?: string;
  end?: string;
}

interface XBRLResponse {
  facts: {
    'us-gaap'?: Record<string, {
      units: Record<string, XBRLFact[] | undefined>;
    }>;
  };
}

interface SubmissionResponse {
  name: string;
  sicDescription: string;
}

// ============================================================
// Helpers
// ============================================================

function getLatestByYear(facts: XBRLFact[]): Map<number, number> {
  // Filter to annual (10-K) filings, exclude dimensional/segment facts.
  // Group by end-date year (fy is the filing year, not the data's fiscal year).
  const annual = facts.filter(
    (f) => f.form === '10-K' && f.fp === 'FY' && !f.frame,
  );

  // Group by the calendar year of the period end date
  const byYear = new Map<number, number[]>();
  for (const f of annual) {
    const endYear = parseInt(f.end?.substring(0, 4) ?? String(f.fy), 10);
    if (!byYear.has(endYear)) byYear.set(endYear, []);
    byYear.get(endYear)!.push(f.val);
  }

  // For each year, take the maximum value (annual total > quarterly/partial)
  const result = new Map<number, number>();
  for (const [year, values] of byYear) {
    result.set(year, Math.max(...values));
  }
  return result;
}

function getFirstAvailableTag(
  facts: Record<string, { units: Record<string, XBRLFact[] | undefined> }>,
  candidates: string[],
): Map<number, number> | null {
  const result = findBestTag(facts, candidates);
  return result?.data ?? null;
}

function findBestTag(
  facts: Record<string, { units: Record<string, XBRLFact[] | undefined> }>,
  candidates: string[],
): { tag: string; data: Map<number, number> } | null {
  let best: Map<number, number> | null = null;
  let bestTag = '';
  let bestMaxYear = 0;

  for (const tag of candidates) {
    const factGroup = facts[tag];
    if (!factGroup) continue;

    for (const unitData of Object.values(factGroup.units)) {
      if (!unitData) continue;
      const data = getLatestByYear(unitData);
      if (data.size === 0) continue;

      const maxYear = Math.max(...data.keys());
      const isBetter = !best || maxYear > bestMaxYear || (maxYear === bestMaxYear && data.size > best.size);
      if (isBetter) {
        best = data;
        bestTag = tag;
        bestMaxYear = maxYear;
      }
    }
  }
  return best ? { tag: bestTag, data: best } : null;
}

// ============================================================
// Data provider
// ============================================================

export const secEdgarProvider: DataProvider = {
  name: 'sec-edgar',

  // ------- fetchFinancials -------

  async fetchFinancials(req: FetchFinancialsRequest): Promise<FinancialRow[]> {
    await loadDynamicCIK();
    const cik = getCIK(req.ticker);
    if (!cik) {
      throw new Error(`Unknown ticker: ${req.ticker}. No CIK mapping found.`);
    }

    const url = `https://data.sec.gov/api/xbrl/companyfacts/${padCIK(cik)}.json`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'investment-platform/1.0 contact@example.com',
        'Accept-Encoding': 'gzip, deflate',
      },
    });

    if (!response.ok) {
      throw new Error(`SEC EDGAR returned ${response.status} for ${req.ticker}`);
    }

    const data = (await response.json()) as XBRLResponse;
    const facts = data.facts?.['us-gaap'];
    if (!facts) {
      throw new Error(`No US-GAAP facts found for ${req.ticker}`);
    }

    // Resolve each tag group
    const rev = TAG_MAP.revenue!;
    const gp = TAG_MAP.gross_profit!;
    const oi = TAG_MAP.operating_income!;
    const ni = TAG_MAP.net_income!;
    const ocf = TAG_MAP.operating_cash_flow!;
    const cap = TAG_MAP.capex!;
    const ast = TAG_MAP.total_assets!;
    const liab = TAG_MAP.total_liabilities!;
    const eq = TAG_MAP.shareholder_equity!;
    const sh = TAG_MAP.shares_outstanding!;

    // Resolve tags with diagnostics
    const diagnostic: Array<{ field: string; candidates: string[]; resolved: string | null; years: number; maxYear: number }> = [];
    const safeFacts = facts!; // already checked above

    function resolveTag(field: string, candidates: string[]): Map<number, number> | null {
      const result = getFirstAvailableTag(safeFacts, candidates);
      const best = findBestTag(safeFacts, candidates);
      diagnostic.push({
        field,
        candidates,
        resolved: best?.tag ?? null,
        years: result?.size ?? 0,
        maxYear: result ? Math.max(...result.keys()) : 0,
      });
      return result;
    }

    const revenueMap = resolveTag('revenue', TAG_MAP.revenue!);
    const gpMap = resolveTag('gross_profit', TAG_MAP.gross_profit!);
    const oiMap = resolveTag('operating_income', TAG_MAP.operating_income!);
    const niMap = resolveTag('net_income', TAG_MAP.net_income!);
    const ocfMap = resolveTag('operating_cash_flow', TAG_MAP.operating_cash_flow!);
    const capexMap = resolveTag('capex', TAG_MAP.capex!);
    const assetsMap = resolveTag('total_assets', TAG_MAP.total_assets!);
    const liabMap = resolveTag('total_liabilities', TAG_MAP.total_liabilities!);
    const equityMap = resolveTag('shareholder_equity', TAG_MAP.shareholder_equity!);
    const sharesMap = resolveTag('shares_outstanding', TAG_MAP.shares_outstanding!);

    console.log(`[sec-edgar] ${req.ticker} tag diagnostics: ${JSON.stringify(diagnostic)}`);

    // Use only years where revenue data exists (most fundamental metric).
    // This avoids creating rows where revenue=0 due to tag range mismatches.
    const allYears = new Set(revenueMap?.keys() ?? []);

    if (allYears.size === 0) {
      throw new Error(`No annual (10-K) financial data found for ${req.ticker}`);
    }

    // Build FinancialRow for each year
    const rows: FinancialRow[] = [];
    for (const fy of [...allYears].sort((a, b) => a - b)) {
      const revenue = revenueMap?.get(fy) ?? 0;
      const grossProfit = gpMap?.get(fy) ?? 0;
      const operatingIncome = oiMap?.get(fy) ?? 0;
      const netIncome = niMap?.get(fy) ?? 0;
      const operatingCashFlow = ocfMap?.get(fy) ?? 0;
      const capex = capexMap?.get(fy) ?? 0;
      const freeCashFlow = operatingCashFlow - capex; // capex is positive in SEC API, subtract for FCF
      const totalAssets = assetsMap?.get(fy) ?? 0;
      const totalLiabilities = liabMap?.get(fy) ?? 0;
      const shareholderEquity = equityMap?.get(fy) ?? 0;
      const sharesOutstanding = sharesMap?.get(fy) ?? 0;

      rows.push({
        ticker: req.ticker.toUpperCase(),
        fiscal_year: fy,
        period_end_date: `${fy}-12-31`,
        revenue,
        gross_profit: grossProfit,
        operating_income: operatingIncome,
        net_income: netIncome,
        operating_cash_flow: operatingCashFlow,
        free_cash_flow: freeCashFlow,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        shareholder_equity: shareholderEquity,
        shares_outstanding: sharesOutstanding,
      });
    }

    return rows;
  },

  // ------- fetchPrice (not implemented — P1) -------

  async fetchPrice(_req: FetchPriceRequest): Promise<PriceData> {
    throw new Error('Price data not available via SEC EDGAR. Use a market data provider.');
  },

  // ------- fetchAllTickers (returns mapped tickers only) -------

  async fetchAllTickers(): Promise<string[]> {
    return Object.keys(HARDCODED_CIK);
  },
};
