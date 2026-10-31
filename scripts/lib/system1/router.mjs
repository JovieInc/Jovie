/**
 * The one entry point for System-1 calls (fast, narrow, cheap judgments).
 *
 *   const r = await system1Call({ task: 'backlog-readiness', state, key: 'JOV-123' });
 *   r.decision   // 'ready' | 'not_ready' | null (abstained)
 *   r.callId     // join the later outcome with: system1.mjs label --task ... --key JOV-123 --label ready
 *
 * Transport reuses packages/api-client (shared budget, breaker, retries) via
 * the Cloudflare and AI Gateway providers; nothing here opens its own socket.
 * Every call, success or failure, is appended to the ledger with the input
 * hash, output, latency and cost, plus the task's prompt version, so outcomes
 * can be joined later and versions compared. A provider failure never throws:
 * it returns status 'error' and the caller falls back to its existing path.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CALL_SCHEMA, createStore, newId, sha256 } from './store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
export const TASKS_PATH = join(REPO, 'ops', 'registry', 'system1-tasks.json');

export function loadRegistry(path = TASKS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function taskOf(registry, task) {
  const def = registry.tasks?.[task];
  if (!def) throw new Error(`unknown system1 task: ${task}`);
  return def;
}

/** Active version of a task: the tuned pointer in the state dir, else the baseline. */
export function activeVersion(registry, task, store) {
  const def = taskOf(registry, task);
  const saved = store.versions(task);
  if (saved?.active) {
    const hit = saved.history.find(v => v.id === saved.active);
    if (hit) return { ...hit.spec, id: hit.id };
  }
  return { ...def.baseline, id: 'v1' };
}

/** Version by id (baseline v1 or a tuned history entry). */
export function versionById(registry, task, store, id) {
  if (id === 'v1') return { ...taskOf(registry, task).baseline, id: 'v1' };
  const hit = store.versions(task)?.history.find(v => v.id === id);
  return hit ? { ...hit.spec, id: hit.id } : null;
}

/** State text sent to the model: preamble, optional worked examples, then the input. */
export function buildState(version, state) {
  const parts = [version.preamble];
  if (version.fewshot?.length) {
    parts.push(
      'Worked examples (verified outcomes):',
      ...version.fewshot.map(
        (ex, i) => `Example ${i + 1}:\n${ex.state}\nCorrect answer: ${ex.label}`
      ),
      'Now judge this one.'
    );
  }
  parts.push(`INPUT:\n${state}`);
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Choice -> decision. Default: the model's argmax with a per-class abstain
 * floor. Binary tasks may instead set `positiveCutoff`: the positive class wins
 * when its probability reaches the cutoff (a recalibrated operating point), and
 * the floors are not applied.
 */
export function decide(version, task, answers) {
  const answer = answers?.[task.primary];
  if (answer?.type !== 'choice' || !task.labels.includes(answer.choice))
    return { invalid: true, decision: null, abstained: true };
  const probabilities = answer.probabilities ?? null;
  if (
    version.positiveCutoff !== undefined &&
    task.labels.length === 2 &&
    probabilities
  ) {
    const other = task.labels.find(l => l !== task.positive);
    const pPos = Number.isFinite(probabilities[task.positive])
      ? probabilities[task.positive]
      : Number.isFinite(probabilities[other])
        ? 1 - probabilities[other]
        : null;
    if (pPos !== null) {
      const choice = pPos >= version.positiveCutoff ? task.positive : other;
      return {
        invalid: false,
        choice,
        confidence: choice === task.positive ? pPos : 1 - pPos,
        probabilities,
        decision: choice,
        abstained: false,
      };
    }
  }
  const p = probabilities?.[answer.choice];
  const confidence = Number.isFinite(p) ? p : (answer.confidence ?? null);
  const floor =
    version.thresholds?.[answer.choice] ?? version.thresholds?.default ?? 0;
  const abstained = confidence === null || confidence < floor;
  return {
    invalid: false,
    choice: answer.choice,
    confidence,
    probabilities,
    decision: abstained ? null : answer.choice,
    abstained,
  };
}

function costOf(route, inputTokens, outputTokens = 0) {
  return (
    (inputTokens / 1e6) * route.usdPerMInput +
    (outputTokens / 1e6) * (route.usdPerMOutput ?? 0)
  );
}

/** Spend today, production and tuning replays counted separately so tuning never starves production. */
function spentToday(store, task, now, replay) {
  const day = new Date(now()).toISOString().slice(0, 10);
  return store
    .calls({ task, since: `${day}T00:00:00.000Z` })
    .filter(c => Boolean(c.replay) === replay)
    .reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
}

/** Default transports; tests inject fakes. Each returns {answers, inputTokens, outputTokens, costUsd?}. */
export const transports = {
  async jev({ route, state, questions, env, createClient }) {
    const { createApiClient } = await import(
      '../../../packages/api-client/client.ts'
    );
    const { hashCredential } = await import(
      '../../../packages/api-client/store.ts'
    );
    const key = env.AI_GATEWAY_API_KEY;
    if (!key) throw new Error('AI_GATEWAY_API_KEY not set');
    const client = (createClient ?? createApiClient)({
      provider: 'ai-gateway',
      credential: hashCredential('ai-gateway', key),
      authorize: h => h.set('Authorization', `Bearer ${key}`),
    });
    const res = await client.request({
      url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { model: route.model, state, questions },
      priority: 'default',
      write: false,
      idempotent: true,
      maxAttempts: 2,
      maxWaitMs: 20_000,
      timeoutMs: 20_000,
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`ai-gateway-${res.status}`);
    const body = res.json();
    const reported = Number(body.provider_metadata?.gateway?.cost);
    return {
      answers: body.answers,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
      costUsd: Number.isFinite(reported) ? reported : undefined,
    };
  },
  async clef({ route, state, questions, images, env, createClient }) {
    const { callClef, resolveWorkersAiAuth } = await import(
      '../../invariants/clef-screenshot-evaluator.mjs'
    );
    const result = await callClef({
      auth: resolveWorkersAiAuth({ env }),
      model: route.model,
      state,
      questions,
      images: images ?? [],
      createClient,
    });
    return {
      answers: result.answers,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    };
  },
};

/**
 * `versionObject` and `replay` are for the tuning loop: score a candidate version
 * on a stored input without touching the active pointer; replays are excluded
 * from volume, accuracy and outcome joins.
 * @param {{task: string, state: string, images?: Array<Buffer|string>, key?: string, caller?: string, shadow?: boolean, replay?: boolean, routes?: string[], versionId?: string, versionObject?: object}} request
 * @param {{registry?: object, store?: object, env?: object, now?: () => number, transports?: object, createClient?: Function, routeAvailable?: (route: object) => boolean}} [deps]
 */
export async function system1Call(request, deps = {}) {
  const registry = deps.registry ?? loadRegistry();
  const store = deps.store ?? createStore();
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const impl = { ...transports, ...(deps.transports ?? {}) };
  const task = taskOf(registry, request.task);
  const version =
    request.versionObject ??
    (request.versionId
      ? versionById(registry, request.task, store, request.versionId)
      : activeVersion(registry, request.task, store));
  if (!version) throw new Error(`unknown version ${request.versionId}`);
  const images = request.images ?? [];
  const inputHash = sha256(
    JSON.stringify([request.state, images.map(i => sha256(i))])
  );
  const callId = newId('s1');
  const start = now();
  const base = {
    schema: CALL_SCHEMA,
    callId,
    ts: new Date(start).toISOString(),
    task: request.task,
    version: version.id,
    key: request.key ?? null,
    caller: request.caller ?? null,
    shadow: Boolean(request.shadow),
    replay: Boolean(request.replay),
    inputHash,
  };
  if (task.retainInput) {
    store.saveInput(inputHash, {
      state: request.state,
      images: images.map(i =>
        typeof i === 'string'
          ? i
          : `data:image/png;base64,${i.toString('base64')}`
      ),
    });
  }

  const cap = request.replay
    ? (task.tuneDailyCapUsd ?? task.dailyCapUsd)
    : task.dailyCapUsd;
  if (
    cap &&
    spentToday(store, request.task, now, Boolean(request.replay)) >= cap
  ) {
    const row = {
      ...base,
      status: 'over-budget',
      decision: null,
      abstained: true,
      costUsd: 0,
      latencyMs: 0,
    };
    store.appendCall(row);
    return row;
  }

  const questions = version.questions;
  const text = buildState(version, request.state);
  const order = (request.routes ?? version.routes).filter(id => {
    const route = registry.routes[id];
    if (!route) return false;
    if (images.length && !route.images) return false;
    return deps.routeAvailable ? deps.routeAvailable(route) : true;
  });
  const errors = [];
  for (const id of order) {
    const route = registry.routes[id];
    const t0 = now();
    try {
      const out = await impl[route.kind]({
        route,
        state: text,
        questions,
        images,
        env,
        createClient: deps.createClient,
      });
      const verdict = decide(version, task, out.answers);
      const latencyMs = now() - t0;
      const listUsd = costOf(route, out.inputTokens, out.outputTokens);
      const row = {
        ...base,
        status: verdict.invalid ? 'invalid' : 'ok',
        route: {
          id,
          pathId: route.pathId,
          model: route.model,
          accessPath: route.accessPath,
          funding: route.funding,
        },
        choice: verdict.choice ?? null,
        confidence: verdict.confidence ?? null,
        probabilities: verdict.probabilities ?? null,
        decision: verdict.decision,
        abstained: verdict.abstained,
        latencyMs,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        costUsd: out.costUsd ?? listUsd,
        listUsd,
        fallbackFrom: errors.length ? errors.map(e => e.route) : undefined,
      };
      store.appendCall(row);
      return row;
    } catch (error) {
      errors.push({
        route: id,
        error: String(error.message ?? error).slice(0, 160),
      });
    }
  }
  const row = {
    ...base,
    status: 'error',
    decision: null,
    abstained: true,
    costUsd: 0,
    latencyMs: now() - start,
    errors,
  };
  store.appendCall(row);
  return row;
}
