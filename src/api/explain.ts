import { Env } from '../types';
import { generateExplanation } from '../explain/score-explainer';

export async function handleExplain(
  _request: Request,
  env: Env,
  ticker: string,
): Promise<Response> {
  const explanation = await generateExplanation(env, ticker);

  if (!explanation) {
    return Response.json(
      { error: `No data for ${ticker.toUpperCase()}. Run seed first.` },
      { status: 404 },
    );
  }

  return Response.json(explanation);
}
