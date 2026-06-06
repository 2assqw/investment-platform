import { DataProvider } from '../providers';
import { updateValuation } from './update-valuation';
import { updateFundamentals } from './update-fundamentals';
import { listTickers } from '../db';
import { Env } from '../types';

/**
 * Filing trigger job (on 10-Q/10-K detection): full recalculation.
 * Runs fundamentals THEN valuation to ensure all scores are fresh.
 */
export async function updateAll(
  env: Env,
  provider: DataProvider,
): Promise<void> {
  console.log('[update-all] Starting full recalculation...');

  const tickers = await listTickers(env.DB);
  if (tickers.length === 0) {
    console.log('[update-all] No tickers found');
    return;
  }

  // 1. Run fundamentals (quality, growth, risk)
  await updateFundamentals(env, tickers);

  // 2. Run valuation (price-based)
  await updateValuation(env, provider);

  console.log('[update-all] Full recalculation complete');
}
