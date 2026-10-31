/**
 * jovie-cron-hub: the one Cloudflare cron. Dispatches registered tasks
 * (src/tasks.ts) and exposes per-task freshness for the dead-man. Event-driven
 * checks never live here; this is only for jobs with no event to trigger them.
 */
import {
  afterRun,
  dueTasks,
  EMPTY_STATE,
  overdue,
  type Task,
  type TaskState,
} from './schedule.ts';
import { TASKS } from './tasks.ts';

type KV = {
  get(k: string): Promise<string | null>;
  put(k: string, v: string): Promise<void>;
};
type Env = { STATE: KV; [secret: string]: unknown };

async function loadStates(env: Env, tasks: readonly Task[]) {
  const entries = await Promise.all(
    tasks.map(async t => {
      const raw = await env.STATE.get(`task:${t.id}`);
      return [
        t.id,
        raw ? (JSON.parse(raw) as TaskState) : EMPTY_STATE,
      ] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function dispatch(
  task: Task,
  env: Env,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const secret = env[task.secret];
  if (typeof secret !== 'string' || !secret) return false;
  try {
    const res = await fetchImpl(task.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function tick(
  env: Env,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch,
  tasks: readonly Task[] = TASKS
) {
  const states = await loadStates(env, tasks);
  const due = dueTasks(tasks, states, now);
  const results = await Promise.all(
    due.map(async task => {
      const ok = await dispatch(task, env, fetchImpl);
      const next = afterRun(states[task.id] ?? EMPTY_STATE, ok, now);
      await env.STATE.put(`task:${task.id}`, JSON.stringify(next));
      return { id: task.id, ok };
    })
  );
  await env.STATE.put('hub:lastTickAt', String(now));
  const failed = results.filter(r => !r.ok).map(r => r.id);
  if (failed.length) console.error(JSON.stringify({ hub: 'cron-hub', failed }));
  return { dispatched: results.length, failed };
}

export default {
  async scheduled(_event: unknown, env: Env) {
    await tick(env);
  },
  async fetch(_req: Request, env: Env) {
    const states = await loadStates(env, TASKS);
    const last = await env.STATE.get('hub:lastTickAt');
    return new Response(
      JSON.stringify({
        last_cron_at: last ? new Date(Number(last)).toISOString() : null,
        overdue: overdue(TASKS, states, Date.now()),
        tasks: TASKS.map(t => ({
          id: t.id,
          everyMin: t.everyMin,
          enabled: t.enabled,
          ...states[t.id],
        })),
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  },
};
