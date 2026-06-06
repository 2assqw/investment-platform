import { Env } from '../types';
import { snapshotAllScores } from '../db';

export async function runHistorySnapshot(env: Env): Promise<void> {
  console.log('[snapshot-history] Starting daily snapshot...');
  await snapshotAllScores(env.DB);
  console.log('[snapshot-history] Done.');
}
