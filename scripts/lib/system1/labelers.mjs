/**
 * Outcome labelers: turn what the closed loops later observed into ground
 * truth for calls already in the ledger. A labeler never calls a model; it
 * reads an outcome source (today the lanes' Linear mirror) and appends label
 * rows for call keys whose outcome is now known. Undecided keys stay unlabeled.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { LABEL_SCHEMA } from './store.mjs';

const REACHED_PR = new Set(['Validating', 'Merging', 'In Review']);
const BOUNCED_LABEL =
  /^(codex-blocked|blocked|needs-human|needs:human|human-review-required|human-gate|needs-design-brief|quality-gap:needs-tim|ws:human-decision)$/;

const labelNames = issue =>
  (issue.labels ?? [])
    .map(l => (typeof l === 'string' ? l : l?.name))
    .filter(Boolean);

/**
 * backlog-readiness: an issue that reached Validating/Merging/In Review produced
 * agent work that landed on the PR path (ready); one sent to Rework or carrying a
 * blocked/human-decision label bounced (not_ready). Everything else is undecided.
 */
export function backlogReadinessOutcome(issue) {
  const bounced = labelNames(issue).find(l => BOUNCED_LABEL.test(l));
  if (issue.state === 'Rework')
    return { label: 'not_ready', evidence: 'state=Rework' };
  if (bounced) return { label: 'not_ready', evidence: `label=${bounced}` };
  if (REACHED_PR.has(issue.state))
    return { label: 'ready', evidence: `state=${issue.state}` };
  return null;
}

export const LABELERS = Object.freeze({
  'backlog-readiness': {
    source: 'linear-mirror',
    keyOf: issue => issue.identifier,
    outcome: backlogReadinessOutcome,
  },
});

export function defaultMirrorPaths(env = process.env, home = homedir()) {
  const lanes =
    env.JOVIE_API_STATE_DIR ||
    env.LANES_STATE ||
    join(home, '.local', 'state', 'jovie-lanes');
  const dir = join(lanes, 'linear');
  try {
    return readdirSync(dir)
      .filter(f => /^mirror-.*\.json$/.test(f))
      .map(f => join(dir, f));
  } catch {
    return [];
  }
}

export function loadMirrorIssues(paths) {
  const issues = [];
  for (const path of paths) {
    const raw = JSON.parse(readFileSync(path, 'utf8')).issues;
    issues.push(...(Array.isArray(raw) ? raw : Object.values(raw ?? {})));
  }
  return issues;
}

/**
 * Appends a label for every called key whose outcome is decided and differs from
 * its newest existing label. Returns counts so the weekly receipt shows the join.
 */
export function labelOutcomes({ store, task, issues, now = Date.now }) {
  const labeler = LABELERS[task];
  if (!labeler) return { task, status: 'no-labeler' };
  const byKey = new Map(issues.map(i => [labeler.keyOf(i), i]));
  const keys = new Set(
    store
      .calls({ task })
      .filter(c => !c.replay && c.key)
      .map(c => c.key)
  );
  const existing = new Map();
  for (const row of store.labels(task)) {
    if (
      row.key &&
      (!existing.has(row.key) || row.ts >= existing.get(row.key).ts)
    )
      existing.set(row.key, row);
  }
  const counts = {
    task,
    keys: keys.size,
    matched: 0,
    undecided: 0,
    appended: 0,
    unchanged: 0,
    missing: 0,
  };
  for (const key of keys) {
    const issue = byKey.get(key);
    if (!issue) {
      counts.missing += 1;
      continue;
    }
    const outcome = labeler.outcome(issue);
    if (!outcome) {
      counts.undecided += 1;
      continue;
    }
    counts.matched += 1;
    if (existing.get(key)?.label === outcome.label) {
      counts.unchanged += 1;
      continue;
    }
    store.appendLabel({
      schema: LABEL_SCHEMA,
      ts: new Date(now()).toISOString(),
      task,
      key,
      label: outcome.label,
      source: labeler.source,
      evidence: outcome.evidence,
    });
    counts.appended += 1;
  }
  return counts;
}
