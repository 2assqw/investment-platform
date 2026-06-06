import { Env } from '../types';
import { seedTicker } from './seed';

export async function seedNVDA(env: Env): Promise<Response> {
  return seedTicker(env, 'NVDA', false);
}
