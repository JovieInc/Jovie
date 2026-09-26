#!/usr/bin/env node
// Turns build-log deprecation warnings into deduped Linear work for the
// autonomous `devin` lane (Todo + label devin). One issue per distinct
// warning; re-runs only bump the existing issue.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  JOVIE_TEAM_ID,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

const ANSI = /\u001b\[[0-9;]*m/g;
// GitHub log lines are `<job>\t<step>\t<ISO time> <text>`; keep only the text.
const LOG_PREFIX = /^.*?\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/;
const DEPRECATION = /\bdeprecat(ed|ion)\b|\[DEP\d{4}\]/i;
// ponytail: 10 per run caps Linear spam if a toolchain bump floods warnings.
export const MAX_ISSUES_PER_RUN = 10;

/** Normalize volatile bits so the same warning always has one fingerprint. */
export function normalizeWarning(line) {
  return line
    .replace(ANSI, '')
    .replace(LOG_PREFIX, '')
    .replace(/\(node:\d+\)/g, '(node)')
    .replace(/\/home\/runner\/work\/[^\s)]+/g, '<path>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDeprecations(log) {
  const seen = new Map();
  for (const raw of log.split('\n')) {
    if (!DEPRECATION.test(raw)) continue;
    const text = normalizeWarning(raw);
    if (text.length < 12 || /^(\+|echo\b)/.test(text)) continue;
    const fingerprint = `deprecation-${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
    if (!seen.has(fingerprint)) seen.set(fingerprint, text.slice(0, 500));
  }
  return [...seen].map(([fingerprint, text]) => ({ fingerprint, text }));
}

async function resolveLabelId(name, apiKey) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: apiKey },
    body: JSON.stringify({
      query: `query($teamId: String!, $name: String!) { team(id: $teamId) { labels(filter: { name: { eq: $name } }) { nodes { id } } } }`,
      variables: { teamId: JOVIE_TEAM_ID, name },
    }),
  });
  /** @type {{ data?: { team?: { labels?: { nodes?: Array<{ id: string }> } } } }} */
  const body = await response.json();
  return body?.data?.team?.labels?.nodes?.[0]?.id ?? null;
}

async function main() {
  const [logPath, sourceUrl = 'unknown run'] = process.argv.slice(2);
  const apiKey = process.env.LINEAR_API_KEY;
  if (!logPath) throw new Error('usage: deprecation-intake.mjs <log> [runUrl]');
  const warnings = extractDeprecations(readFileSync(logPath, 'utf8'));
  console.log(`[deprecation-intake] ${warnings.length} distinct warning(s)`);
  if (warnings.length === 0) return;
  if (!apiKey) throw new Error('LINEAR_API_KEY is required');
  const devinLabel = await resolveLabelId('devin', apiKey);
  if (!devinLabel) throw new Error('Linear label "devin" not found');

  for (const { fingerprint, text } of warnings.slice(0, MAX_ISSUES_PER_RUN)) {
    const result = await upsertLinearIssueByTitleFingerprint({
      fingerprint,
      title: `[${fingerprint}] Resolve deprecation: ${text.slice(0, 140)}`,
      description: [
        'Automated deprecation intake from the main-branch build log.',
        '',
        '```',
        text,
        '```',
        '',
        `Source: ${sourceUrl}`,
        '',
        '## Done when',
        '- The warning no longer appears in the build output.',
        '- Behavior is unchanged (tests for the touched code pass).',
        '- If the warning comes from a third-party dependency with no fix, upgrade it or close this issue with the upstream reference.',
      ].join('\n'),
      priority: 4,
      createStateName: 'Todo',
      createLabelIds: [devinLabel],
      apiKey,
    });
    console.log(
      `[deprecation-intake] ${fingerprint}: ${JSON.stringify({ ok: result.ok, action: result.action, id: result.identifier, reason: result.reason })}`
    );
    if (!result.ok) process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
