/**
 * Call-site adapters: one small function per migrated task so a call site
 * changes by a few lines. Owners of the call sites (backlog refill, the
 * production dogfood runner) keep their code; they swap their model call for
 * these and report the outcome with `recordOutcome`.
 */

import { system1Call } from './router.mjs';
import { createStore, LABEL_SCHEMA } from './store.mjs';

const MAX_ISSUE_CHARS = 2500;

/** State text for backlog-readiness: title plus description. Labels and state are left out on purpose, they encode the outcome. */
export function readinessState(issue) {
  return `Title: ${issue.title}\n${String(issue.description ?? '').slice(0, MAX_ISSUE_CHARS)}`;
}

/**
 * @param {{identifier: string, title: string, description?: string}} issue
 * @returns {Promise<{ready: boolean|null, callId: string, confidence: number|null, status: string}>}
 *   ready is null when the model abstained or failed: keep the existing heuristic.
 */
export async function judgeReadiness(issue, deps = {}) {
  const row = await system1Call(
    {
      task: 'backlog-readiness',
      state: readinessState(issue),
      key: issue.identifier,
      caller: deps.caller ?? 'backlog-refill',
      shadow: deps.shadow,
    },
    deps
  );
  return {
    ready: row.decision === null ? null : row.decision === 'ready',
    callId: row.callId,
    confidence: row.confidence ?? null,
    status: row.status,
  };
}

/**
 * @param {{expectation: string, png: Buffer, key: string, viewport?: string}} shot
 *   key must be stable per page+viewport+build (for example `${sha}:${page}:${viewport}`)
 *   so a later confirm or dismiss joins back to this call.
 * @returns {Promise<{defect: boolean|null, callId: string, confidence: number|null, status: string}>}
 */
export async function judgeScreenshot(shot, deps = {}) {
  const row = await system1Call(
    {
      task: 'dogfood-vision',
      state: `Expected state: ${shot.expectation}${shot.viewport ? `\nViewport: ${shot.viewport}` : ''}`,
      images: [shot.png],
      key: shot.key,
      caller: deps.caller ?? 'prod-dogfood',
      shadow: deps.shadow,
    },
    deps
  );
  return {
    defect: row.decision === null ? null : row.decision === 'defect',
    callId: row.callId,
    confidence: row.confidence ?? null,
    status: row.status,
  };
}

/** Report what actually happened (finding confirmed or dismissed, PR merged or bounced). */
export function recordOutcome(
  { task, key, label, source, evidence },
  deps = {}
) {
  const store = deps.store ?? createStore();
  const row = {
    schema: LABEL_SCHEMA,
    ts: new Date((deps.now ?? Date.now)()).toISOString(),
    task,
    key,
    label,
    source,
    evidence: evidence ?? null,
  };
  store.appendLabel(row);
  return row;
}
