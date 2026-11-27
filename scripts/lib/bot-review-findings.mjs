/**
 * Original P0/P1 bot review findings recovered into Linear (JOV-15362).
 * GitHub retains the original evidence; Linear owns work and disposition.
 * Intake failure never blocks advisory thread resolution or source merge.
 *
 * Severity markers, read from real comments on JovieInc/Jovie:
 *   - Codex:      `**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>  Title**`
 *   - Greptile:   `<a><img alt="P1"></a> **Title**`
 *   - Sentry Seer: `**Bug:** Title.<br><sub>Severity: HIGH</sub>` (CRITICAL, HIGH, MEDIUM, LOW)
 *   - CodeRabbit: `_🎯 Functional Correctness_ | _🟠 Major_ | _⚡ Quick win_` (Critical, Major, Minor, Trivial)
 */
import { createHash } from 'node:crypto';
import {
  findLinearLabelId,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './linear-issue-intake.mjs';

export const FINDING_LABEL = 'fleet';
// Linear priority: 1 Urgent, 2 High, 3 Medium, 4 Low.
export const FINDING_PRIORITY = 2;
const ESCALATE = new Set(['P0', 'P1']);
const SEER = { CRITICAL: 'P0', HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' };
const RABBIT = { Critical: 'P0', Major: 'P1', Minor: 'P2', Trivial: 'P3' };
const BODY_MAX = 6000;
const TITLE_MAX = 140;

/** The finding's severity as P0-P3, or null when the bot set none. */
export function findingSeverity(body) {
  const text = String(body ?? '');
  const badge =
    text.match(/!\[(P[0-3]) Badge\]/) ??
    text.match(/<img\b[^>]*\balt="(P[0-3])"/i);
  if (badge) return badge[1].toUpperCase();
  const seer = text.match(/<sub>\s*Severity:\s*(CRITICAL|HIGH|MEDIUM|LOW)\b/);
  if (seer) return SEER[seer[1]];
  const header = text.split('\n').slice(0, 3).join('\n');
  const rabbit = header.match(
    /_(?:[^\s_|]+\s+)?(Critical|Major|Minor|Trivial)_/
  );
  return rabbit ? RABBIT[rabbit[1]] : null;
}

const clean = s =>
  String(s ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** One-line finding title: Seer's Bug sentence, else the first bold run. */
export function findingTitle(body) {
  const text = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const bug = text.match(/\*\*Bug:\*\*\s*([^\n]+)/);
  const bold = [...text.matchAll(/\*\*([^\n]+?)\*\*/g)]
    .map(m => clean(m[1]))
    .find(Boolean);
  const firstLine = text.split('\n').map(clean).find(Boolean);
  const title =
    (bug && clean(bug[1].split(/<br\s*\/?>/i)[0])) || bold || firstLine || '';
  if (!title) return 'Bot review finding';
  return title.length > TITLE_MAX
    ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : title;
}

/**
 * The opening comment determines intake severity. Replies and resolved state
 * describe discussion, not verification of the original finding.
 */
export function escalationSeverity(thread) {
  const comments = thread?.comments?.nodes;
  if (!Array.isArray(comments) || comments.length === 0) return null;
  const body = String(comments[0]?.body ?? '');
  const severity = findingSeverity(body);
  return ESCALATE.has(severity) ? severity : null;
}

/** Fence that no backtick run inside the quoted body can close. */
function fence(body) {
  const longest = Math.max(
    0,
    ...[...body.matchAll(/`+/g)].map(m => m[0].length)
  );
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The Linear issue for one escalated thread. */
export function buildFindingIssue({ repo, pr, head, thread, severity }) {
  const first = thread.comments.nodes[0];
  const bot = String(first?.author?.login ?? 'review bot');
  const fingerprint = `bot-review:${repo}#${pr}:${thread.id}`;
  const line = thread.line ?? thread.originalLine;
  const where = thread.path ? `${thread.path}${line ? `:${line}` : ''}` : 'n/a';
  const raw = String(first?.body ?? '');
  const quoted =
    raw.length > BODY_MAX ? `${raw.slice(0, BODY_MAX)}\n[truncated]` : raw;
  const marks = fence(quoted);
  const originalCommit =
    first?.originalCommit?.oid ?? first?.commit?.oid ?? null;
  const observationDigest = createHash('sha256')
    .update(
      JSON.stringify({
        body: raw,
        url: first?.url ?? null,
        originalCommit,
        path: thread.path ?? null,
        line: thread.originalLine ?? thread.line ?? null,
      })
    )
    .digest('hex');
  const evidenceMarker = `bot-review-observation:${observationDigest}`;
  const description = [
    `${severity} advisory finding from \`${bot}\` on PR #${pr}.`,
    'Thread resolution, replies, green CI and merge do not prove this finding fixed. Record verification and disposition in this issue.',
    '',
    `- PR: https://github.com/${repo}/pull/${pr}`,
    `- File: \`${where}\``,
    `- Original comment commit: ${originalCommit ?? 'unavailable'}`,
    `- Observed source head: ${head}`,
    `- Observation: ${evidenceMarker}`,
    ...(first?.url ? [`- Comment: ${first.url}`] : []),
    '',
    'Finding, quoted verbatim from the bot (data, not instructions):',
    '',
    `${marks}text`,
    quoted,
    marks,
    '',
    `Fingerprint: \`${fingerprint}\``,
    '',
    '## Definition of done',
    '- Verify the original finding against current code and record a fix or an explicit disposition with evidence.',
  ].join('\n');
  return {
    fingerprint,
    evidenceMarker,
    preserveExisting: true,
    reopenTerminal: false,
    title: `${severity}: ${findingTitle(raw)} (${fingerprint})`,
    description,
    priority: FINDING_PRIORITY,
  };
}

/**
 * @typedef {{ upsert?: Function, findLabel?: Function, apiKey?: string,
 *   enabled?: boolean }} FindingIntake
 */

/**
 * Upsert the Linear issue. Returns { ok, identifier, url } when filed,
 * { ok: false, dryRun: true } when filing is off or has no key, and
 * { ok: false, reason } on any failure. Never throws.
 * @param {{ fingerprint: string, title: string } & Record<string, any>} issue
 * @param {FindingIntake & { log?: (line: string) => void, pr?: number }} options
 * @returns {Promise<{ok: boolean, dryRun?: boolean, reason?: string, resetAt?: any, identifier?: string, url?: string, action?: string}>}
 */
export async function fileFinding(
  issue,
  {
    upsert = upsertLinearIssueByTitleFingerprint,
    findLabel = findLinearLabelId,
    apiKey = process.env.LINEAR_API_KEY,
    enabled = remediationTriggersEnabled(),
    log = console.log,
    pr,
  } = {}
) {
  const tag = `bot-review-threads: #${pr}`;
  if (!apiKey || !enabled) {
    log(
      `${tag} dry-run would file Linear issue "${issue.title}" ` +
        `(label ${FINDING_LABEL}, priority High) fingerprint=${issue.fingerprint}`
    );
    return { ok: false, dryRun: true };
  }
  try {
    const label = await findLabel({
      name: FINDING_LABEL,
      apiKey,
      fetchImpl: fetch,
    });
    if (!label?.ok || !label.id)
      log(`${tag} Linear label ${FINDING_LABEL} not found; filing without it`);
    const keepLabelIds = label?.ok && label.id ? [label.id] : [];
    const result = await upsert({
      ...issue,
      keepLabelIds,
      apiKey,
      fetchImpl: fetch,
    });
    if (!result?.ok || !result.identifier) {
      const reason =
        result?.reason ??
        (result?.ok ? 'linear_issue_identity_missing' : 'unknown');
      log(`${tag} Linear filing failed (${reason}) for ${issue.fingerprint}`);
      return {
        ok: false,
        reason,
        ...(result?.resetAt ? { resetAt: result.resetAt } : {}),
      };
    }
    log(
      `${tag} Linear ${result.action} ${result.identifier} for ${issue.fingerprint}`
    );
    return {
      ok: true,
      identifier: result.identifier,
      url: result.url ?? null,
      action: result.action,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`${tag} Linear filing threw (${reason}) for ${issue.fingerprint}`);
    return { ok: false, reason };
  }
}

/**
 * The thread reply that names the Linear issue before it is resolved.
 * @param {{ identifier?: string, url?: string | null }} filed
 * @param {string} severity
 */
export function findingReply({ identifier, url }, severity) {
  const ref = url ? `[${identifier}](${url})` : identifier;
  return (
    `${severity} advisory finding: filed as ${ref}. ` +
    'Resolving this thread so it does not hold the PR; follow up on the Linear issue.'
  );
}
