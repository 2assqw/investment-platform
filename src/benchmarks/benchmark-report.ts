import { Env } from '../types';
import { runBenchmark } from './benchmark-runner';

export async function handleBenchmarkReport(env: Env): Promise<Response> {
  try {
    const result = await runBenchmark(env.DB);

    return Response.json({
      generatedAt: new Date().toISOString(),
      engineVersion: '1.0.0',
      summary: result.summary,
      industries: result.industries,
      anomalies: result.anomalies,
      tickers: result.tickers,
    });
  } catch (err) {
    return Response.json(
      { error: String(err), generatedAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}
