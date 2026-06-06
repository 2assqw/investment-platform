export interface PriceRow {
  ticker: string;
  date: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
}

const UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN',
  'XOM', 'CVX', 'FCX', 'RIO',
  'JPM', 'BAC',
  'COST', 'WMT', 'JNJ', 'UNH',
  'O', 'PLD',
  'SPY', 'QQQ',
];

export const PRICE_UNIVERSE = UNIVERSE;

function getAvKey(): string {
  try {
    const k = (globalThis as Record<string, unknown>).ALPHA_VANTAGE_KEY;
    if (typeof k === 'string' && k.length > 0) return k;
  } catch { /* not available */ }
  return '';
}

/**
 * Multi-source price fetcher. Tries in order:
 * 1. Alpha Vantage (if ALPHA_VANTAGE_KEY is set)
 * 2. Public GitHub CSV datasets (free, no registration)
 */
/**
 * Tencent Finance (腾讯财经) — free, no registration, works in China.
 * URL: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=us{ticker},day,{start},,{limit},qfq
 * Returns JSON with daily OHLCV data for US stocks.
 */
async function fetchTencentPrices(ticker: string): Promise<PriceRow[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=us${ticker.toUpperCase()},day,2010-01-01,,5000,qfq`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const day = data?.data?.[`us${ticker.toUpperCase()}`]?.day;
    if (!day || !Array.isArray(day)) return [];

    return day.map((row: string[]) => ({
      ticker: ticker.toUpperCase(),
      date: row[0] ?? '',
      openPrice: parseFloat(row[1] ?? '0'),
      closePrice: parseFloat(row[2] ?? '0'),
      highPrice: parseFloat(row[3] ?? '0'),
      lowPrice: parseFloat(row[4] ?? '0'),
      volume: parseInt(row[5] ?? '0', 10),
    }));
  } catch { return []; }
}

export async function fetchStooqPrices(ticker: string): Promise<PriceRow[]> {
  // 1. Tencent Finance (free, works in China)
  const rows = await fetchTencentPrices(ticker);
  if (rows.length > 0) return rows;

  // 2. Alpha Vantage (if key configured)
  const avKey = getAvKey();
  if (avKey) {
    const avRows = await fetchAlphaVantage(ticker, avKey);
    if (avRows.length > 0) return avRows;
  }
  return [];
}

async function fetchAlphaVantage(ticker: string, key: string): Promise<PriceRow[]> {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=full&apikey=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>;
    if (data['Information'] || data['Note'] || data['Error Message']) return [];
    const ts = data['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
    if (!ts) return [];
    const rows: PriceRow[] = [];
    for (const [date, v] of Object.entries(ts)) {
      const o = parseFloat(v['1. open'] ?? '0'), h = parseFloat(v['2. high'] ?? '0');
      const l = parseFloat(v['3. low'] ?? '0'), c = parseFloat(v['4. close'] ?? '0');
      const adj = parseFloat(v['5. adjusted close'] ?? v['4. close'] ?? '0');
      const vol = parseInt(v['6. volume'] ?? '0', 10);
      if (isNaN(adj) || adj <= 0) continue;
      rows.push({ ticker, date, openPrice: isNaN(o) ? adj : o, highPrice: isNaN(h) ? adj : h, lowPrice: isNaN(l) ? adj : l, closePrice: adj, volume: isNaN(vol) ? 0 : vol });
    }
    return rows;
  } catch { return []; }
}

/**
 * Fetches from public GitHub CSV datasets.
 * Uses plotly/datasets for Apple, and falls back to a generic source.
 */
async function fetchGitHubCsv(ticker: string): Promise<PriceRow[]> {
  // Known public datasets on GitHub
  const urls: Record<string, string> = {
    'AAPL': 'https://raw.githubusercontent.com/plotly/datasets/master/finance-charts-apple.csv',
  };

  // Try known URL first
  if (urls[ticker]) {
    try {
      const res = await fetch(urls[ticker]!);
      if (res.ok) {
        const text = await res.text();
        return parseGitHubCsv(text, ticker);
      }
    } catch { /* fall through */ }
  }

  // Try generic path pattern for other tickers
  // Many public repos host ticker data at predictable URLs
  return [];
}

function parseGitHubCsv(text: string, ticker: string): PriceRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const rows: PriceRow[] = [];

  // Detect format: plotly uses "Date,AAPL.Open,AAPL.High,AAPL.Low,AAPL.Close,AAPL.Volume,AAPL.Adjusted,dn,mavg,up, direction"
  // Standard: "Date,Open,High,Low,Close,Adj Close,Volume"
  const header = lines[0]?.toLowerCase() ?? '';
  const isPlotly = header.includes('.open');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 5) continue;

    const date = cols[0]?.trim();
    if (!date) continue;

    let open: number, high: number, low: number, close: number, volume: number;

    if (isPlotly) {
      open = parseFloat(cols[1] ?? '0');
      high = parseFloat(cols[2] ?? '0');
      low = parseFloat(cols[3] ?? '0');
      close = parseFloat(cols[4] ?? '0');
      volume = parseInt(cols[5] ?? '0', 10);
    } else {
      open = parseFloat(cols[1] ?? '0');
      high = parseFloat(cols[2] ?? '0');
      low = parseFloat(cols[3] ?? '0');
      close = parseFloat(cols[4] ?? '0');
      const adjIdx = cols.length >= 7 ? 5 : 4;
      close = parseFloat(cols[adjIdx] ?? cols[4] ?? '0');
      volume = parseInt(cols[6] ?? cols[5] ?? '0', 10);
    }

    if (isNaN(close) || close <= 0) continue;

    rows.push({
      ticker, date,
      openPrice: isNaN(open) ? close : open,
      highPrice: isNaN(high) ? close : high,
      lowPrice: isNaN(low) ? close : low,
      closePrice: close,
      volume: isNaN(volume) ? 0 : volume,
    });
  }
  return rows;
}
