#!/usr/bin/env node
// JOV-13063: every PR maps to an existing Linear issue (Linear is the system of record).
// Native GitHub<->Linear sync is disabled (Tim, 2026-11-19 9:40 AM PT), so this
// check reads only explicit text the repository's own writer
// (scripts/lib/linear-sync-on-merge.mjs) also reads: title, branch, a
// `Refs JOV-123` line, or linear-issue-identifier / linear-issue-id markers.

// api-budget: linear-requests 120/hr - one batched issue read per Source Validation run on a PR event (peak ~120 PR pushes/edits per hour), default priority.
// api-budget: linear-complexity 6000/hr - the same reads at <=10 aliased issues (~50 points each).

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  createLinearClient,
  issueField,
} from '../../packages/api-client/linear.ts';

export const LINEAR_REFERENCE_SCHEMA = 'jovie-linear-reference/v1';
const LINEAR_MAX_IDS = 10;

/** @param {string[]} teams */
function keyPattern(teams) {
  const alt = teams.map(t => t.replace(/[^A-Z]/gi, '')).join('|');
  return new RegExp(
    `(?:^|[^A-Za-z0-9])((?:${alt})-[1-9][0-9]*)(?![0-9A-Za-z])`,
    'gi'
  );
}

/**
 * Collect candidate identifiers from the places the merge writer reads.
 * Free prose mentions in the body do not count: only the title, the branch,
 * a line that starts with `Refs`, or an explicit marker.
 * @param {{ title?: string, body?: string | null, headRef?: string }} pr
 * @param {string[]} teams
 */
export function extractLinearReferences(pr, teams = ['JOV', 'LYB', 'SYM']) {
  const found = new Map();
  const add = (raw, source) => {
    const id = raw.toUpperCase();
    if (!found.has(id)) found.set(id, new Set());
    found.get(id).add(source);
  };
  const re = () => keyPattern(teams);
  for (const m of String(pr.title ?? '').matchAll(re())) add(m[1], 'title');
  for (const m of String(pr.headRef ?? '').matchAll(re())) add(m[1], 'branch');
  const body = String(pr.body ?? '');
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*refs:?\s/i.test(line))
      for (const m of line.matchAll(re())) add(m[1], 'refs-line');
    const marker = /linear-issue-(?:identifier|id):\s*([A-Za-z]+-[0-9]+)/i.exec(
      line
    );
    if (marker)
      for (const m of ` ${marker[1]}`.matchAll(re())) add(m[1], 'marker');
  }
  return [...found].map(([identifier, sources]) => ({
    identifier,
    sources: [...sources].sort(),
  }));
}

/**
 * @param {{ author?: string, headRef?: string }} pr
 * @param {{ exempt?: { author: string, branchPrefix?: string[], reason: string }[] }} policy
 */
export function exemptionFor(pr, policy) {
  for (const rule of policy.exempt ?? []) {
    if (!rule.reason || rule.reason.trim().length < 20) continue; // a reason is mandatory
    if (rule.author !== pr.author) continue;
    if (
      rule.branchPrefix &&
      !rule.branchPrefix.some(p => String(pr.headRef ?? '').startsWith(p))
    )
      continue;
    return rule;
  }
  return null;
}

/**
 * Pure decision. `issues` maps identifier -> lookup result from Linear
 * ({ exists, state, createdAt }) or is null when the lookup was unavailable.
 * @param {{
 *   pr: { title?: string, body?: string | null, headRef?: string, author?: string, fork?: boolean, createdAt?: string },
 *   policy: { mode?: string, teams?: string[], exempt?: any[] },
 *   issues: Record<string, { exists: boolean, state?: string, createdAt?: string, title?: string }> | null,
 * }} input
 */
export function evaluateLinearReference({ pr, policy, issues }) {
  const mode = policy.mode === 'enforce' ? 'enforce' : 'observe';
  const base = { schema: LINEAR_REFERENCE_SCHEMA, mode };
  const exemption = exemptionFor(pr, policy);
  if (exemption)
    return {
      ...base,
      allowed: true,
      verdict: 'exempt',
      reason: exemption.reason,
      references: [],
    };
  const references = extractLinearReferences(pr, policy.teams);
  if (references.length === 0)
    return {
      ...base,
      allowed: mode !== 'enforce',
      verdict: 'missing',
      references,
      fix: 'Find or create the Linear issue first, then add a line `Refs JOV-123` to the PR body (or put the key in the title or branch).',
    };
  if (issues === null)
    // Linear outage or quota: never block on our own dependency. The merge
    // writer re-verifies after merge and files a JOV issue for orphans.
    return { ...base, allowed: true, verdict: 'unverified', references };
  const resolved = references.map(r => ({
    ...r,
    ...(issues[r.identifier] ?? { exists: false }),
  }));
  const live = resolved.filter(
    r => r.exists && !/^(canceled|cancelled|duplicate)$/i.test(r.state ?? '')
  );
  if (live.length === 0)
    return {
      ...base,
      allowed: mode !== 'enforce',
      verdict: 'unknown-or-dead-issue',
      references: resolved,
      fix: 'Reference an existing Linear issue that is not Canceled or Duplicate.',
    };
  const shell = live.every(
    r =>
      r.createdAt &&
      pr.createdAt &&
      Date.parse(r.createdAt) > Date.parse(pr.createdAt) &&
      /^(pr|pull request|fix|wip|todo|tbd|update)?\s*#?\d*$/i.test(
        String(r.title ?? '').trim()
      )
  );
  if (shell)
    // Junk issue created after the PR only to satisfy the check: observe-only signal
    // for Orchestrator sampling. Never a merge blocker (no AI or taste judgement here).
    return {
      ...base,
      allowed: true,
      verdict: 'linked-low-quality',
      references: resolved,
    };
  return { ...base, allowed: true, verdict: 'linked', references: resolved };
}

/**
 * One batched GraphQL read for all identifiers through the shared Linear
 * client (packages/api-client: budget ledger, breaker, bounded retries).
 * Returns null on any failure so the caller fails open (`unverified`).
 * @param {string[]} identifiers
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number, legacyStateRoot?: string | null }} [options]
 */
export async function lookupLinearIssues(
  identifiers,
  {
    apiKey = process.env.LINEAR_API_KEY,
    fetchImpl,
    timeoutMs = 8000,
    legacyStateRoot,
  } = {}
) {
  if (identifiers.length === 0) return {};
  if (!apiKey) return null;
  const ids = identifiers.slice(0, LINEAR_MAX_IDS);
  try {
    const linear = createLinearClient({
      identity: apiKey,
      authorization: () => apiKey,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      ...(legacyStateRoot === undefined ? {} : { legacyStateRoot }),
    });
    const found = await linear.batch(
      ids,
      issueField('identifier title createdAt state { name }'),
      { priority: 'default', timeoutMs, maxWaitMs: timeoutMs }
    );
    const out = {};
    for (const id of ids) {
      const issue = found.get(id);
      out[id] = issue
        ? {
            exists: true,
            state: issue.state?.name,
            createdAt: issue.createdAt,
            title: issue.title,
          }
        : { exists: false };
    }
    return out;
  } catch {
    // Outage, rate limit, auth failure or an open breaker: never block on
    // our own dependency; the merge writer re-verifies after merge.
    return null;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const policy = JSON.parse(
    readFileSync(
      process.env.LINEAR_REFERENCE_POLICY ??
        '.github/linear-reference-policy.json',
      'utf8'
    )
  );
  const p = event.pull_request ?? {};
  const pr = {
    title: p.title,
    body: p.body,
    headRef: p.head?.ref,
    author: p.user?.login,
    fork: p.head?.repo?.fork === true,
    createdAt: p.created_at,
  };
  const refs = extractLinearReferences(pr, policy.teams).map(r => r.identifier);
  const issues = pr.fork ? null : await lookupLinearIssues(refs);
  const receipt = evaluateLinearReference({ pr, policy, issues });
  const fix = linearReferenceFix(receipt);
  console.log(JSON.stringify(receipt));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `- Linear reference (${receipt.mode}): **${receipt.verdict}** ${receipt.references.map(r => r.identifier).join(', ')}${fix ? ` — ${fix}` : ''}\n`
    );
  }
  if (!receipt.allowed) process.exitCode = 1;
  else if (
    (receipt.verdict === 'missing' ||
      receipt.verdict === 'unknown-or-dead-issue') &&
    fix
  )
    console.log(`::warning title=Linear reference (observe)::${fix}`);
}

/**
 * Step summary and the observe warning read `fix` only when that variant has it.
 * The parameter stays untyped: checkJs rejects the receipt union as `{ fix?: string }`.
 */
export function linearReferenceFix(receipt) {
  if (receipt == null || typeof receipt !== 'object' || !('fix' in receipt))
    return '';
  return typeof receipt.fix === 'string' ? receipt.fix : '';
}
