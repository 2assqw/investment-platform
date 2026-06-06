/**
 * Local price seeder — fetch from Yahoo Finance v3, upload to Worker.
 * Usage: npx tsx scripts/seed-prices-local.ts SPY
 *        npx tsx scripts/seed-prices-local.ts --all
 */
import YahooFinance from 'yahoo-finance2';
const API_BASE = 'https://2assqw.cc';

const TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN',
  'XOM', 'CVX', 'FCX', 'JPM', 'BAC',
  'COST', 'WMT', 'JNJ', 'UNH', 'O', 'PLD',
  'SPY', 'QQQ',
];

async function main() {
  const yf = new YahooFinance();
  const arg = process.argv[2];

  if (!arg) {
    console.log('Usage: npx tsx scripts/seed-prices-local.ts SPY');
    console.log('       npx tsx scripts/seed-prices-local.ts --all');
    return;
  }

  const targets = arg === '--all' ? TICKERS : [arg.toUpperCase()];

  for (const ticker of targets) {
    console.log(`\n📊 ${ticker}...`);
    try {
      const result = await yf.chart(ticker, {
        period1: '2020-01-01',
        period2: new Date().toISOString().split('T')[0],
        interval: '1d',
      });

      const quotes = result.quotes.filter((q: any) => q.close).map((q: any) => ({
        ticker: ticker.toUpperCase(),
        date: q.date instanceof Date ? q.date.toISOString().split('T')[0]! : String(q.date),
        openPrice: q.open ?? q.close ?? 0,
        highPrice: q.high ?? q.close ?? 0,
        lowPrice: q.low ?? q.close ?? 0,
        closePrice: q.close ?? 0,
        volume: q.volume ?? 0,
        source: 'yahoo-local',
      }));

      console.log(`  ${quotes.length} rows`);
      for (let i = 0; i < quotes.length; i += 500) {
        const batch = quotes.slice(i, i + 500);
        const res = await fetch(`${API_BASE}/api/admin/upload-prices`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, rows: batch }),
        });
        const d = await res.json() as any;
        console.log(`  batch ${Math.floor(i/500)+1}: ${d.inserted} rows`);
      }
      console.log(`  ✅ ${ticker} done`);
    } catch (e: any) {
      console.log(`  ✗ ${e.message}`);
    }
    if (targets.length > 1) await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n✅ Done!');
}

main();
