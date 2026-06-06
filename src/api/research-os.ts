import { Env } from '../types';
import { initResearchLog, getHypotheses, getExperiments, getNotes, getDecisions, getResearchDashboard, logDecision } from '../research-os/research-log';

export async function handleInitResearchOS(_r: Request, env: Env): Promise<Response> {
  await initResearchLog(env.DB);
  const dashboard = await getResearchDashboard(env.DB);
  return Response.json({ ok: true, dashboard });
}

export async function handleHypotheses(_r: Request, env: Env): Promise<Response> {
  const h = await getHypotheses(env.DB);
  return Response.json({ count: h.length, hypotheses: h });
}

export async function handleExperiments(_r: Request, env: Env): Promise<Response> {
  const e = await getExperiments(env.DB);
  return Response.json({ count: e.length, experiments: e });
}

export async function handleKnowledge(_r: Request, env: Env): Promise<Response> {
  const n = await getNotes(env.DB);
  return Response.json({ count: n.length, notes: n });
}

export async function handleDecisions(_r: Request, env: Env): Promise<Response> {
  const d = await getDecisions(env.DB);
  return Response.json({ count: d.length, decisions: d });
}

export async function handleResearchDashboard(_r: Request, env: Env): Promise<Response> {
  const db = await getResearchDashboard(env.DB);
  return Response.json(db);
}

export async function handleLogDecision(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { action?: string; target?: string; field?: string; oldValue?: string; newValue?: string; reason?: string };
    if (!body.action || !body.target) return Response.json({ error: 'action and target required' }, { status: 400 });
    await logDecision(env.DB, body.action, body.target, body.field ?? null, body.oldValue ?? null, body.newValue ?? null, body.reason ?? '');
    return Response.json({ success: true });
  } catch { return Response.json({ success: false, error: 'invalid JSON' }, { status: 400 }); }
}
