/**
 * Flip-driven quarantine proposals — JOV-13105.
 *
 * Bridges the flake ledger into the EXISTING quarantine list
 * (apps/web/tests/quarantine.json, processed by update-quarantine.js).
 * There is no second list: a flip offender either becomes a schema-conformant
 * entry in that one list or it only gets an owner issue. `plan` (CLI mode)
 * is pure; `apply` upserts the Linear owner issue via the existing intake
 * primitive, validates the mutated quarantine ledger and opens a DRAFT PR
 * with the ledger evidence. An auto-managed entry older than the 14-day cap
 * escalates to the owning area's agent lane — never Tim.
 */ import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import writer from '../.github/scripts/update-quarantine.js';
import { repeatOffenders } from './lib/flake-ledger.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

const REPO = 'JovieInc/Jovie';
const QUARANTINE_LEDGER = 'apps/web/tests/quarantine.json';
const BRANCH_PREFIX = 'codex/quarantine-heal-flip-';
export const FLIP_QUARANTINE_CAP_DAYS = 14;
const DAY = 86400000;
const RUN_OPTS = {
  encoding: 'utf8',
  timeout: 60000,
  maxBuffer: 4 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
};

function fact(ok, message) {
  if (!ok) throw new Error(message);
}

function reproductionCommandFor(mapped) {
  return mapped.kind === 'unit'
    ? `pnpm --filter @jovie/web exec vitest run ${mapped.path}`
    : `pnpm --filter @jovie/web exec playwright test ${mapped.path.slice(9)} --project=chromium`;
}

/**
 * Pure proposal builder. Offenders without a mappable test file become
 * owner-issue-only rows (they cannot enter the quarantine list, which keys
 * on test paths).
 */
export function buildFlipQuarantinePlan({
  offenders,
  quarantine,
  now = Date.now(),
  minFlips = 2,
}) {
  fact(Array.isArray(offenders), 'Offender list required');
  fact(
    quarantine !== null &&
      typeof quarantine === 'object' &&
      Array.isArray(quarantine.entries),
    'Quarantine ledger required'
  );
  const nowIso = new Date(now).toISOString();
  const runUrls = offender =>
    offender.failedRunIds
      .map(runId => `https://github.com/${REPO}/actions/runs/${runId}`)
      .join(', ');
  const entries = [];
  const ownerIssues = [];
  const escalations = [];
  const skipped = [];
  for (const offender of offenders) {
    if (offender.flips < minFlips) continue;
    const testFile = offender.testFiles[0] ?? null;
    const mapped = testFile ? writer.mapToLedgerPath(testFile) : null;
    const existing = mapped
      ? quarantine.entries.find(
          entry => entry.kind === mapped.kind && entry.path === mapped.path
        )
      : null;
    if (existing) {
      const age =
        now - Date.parse(existing.quarantinedAt ?? existing.firstSeenAt);
      if (
        existing.autoManaged === true &&
        Number.isFinite(age) &&
        age >= FLIP_QUARANTINE_CAP_DAYS * DAY
      )
        escalations.push({
          path: mapped.path,
          quarantinedAt: existing.quarantinedAt ?? existing.firstSeenAt,
          issueUrl: existing.fixIssueUrl,
          message: `Quarantine age cap: ${mapped.path} has been auto-quarantined since ${existing.quarantinedAt ?? existing.firstSeenAt} (cap ${FLIP_QUARANTINE_CAP_DAYS} days). Escalating to the owning agent for a fix, not Tim: the owning area's agent lane owns the repair.`,
        });
      else
        skipped.push({
          subject: offender.subject,
          reason: 'already-quarantined',
        });
      continue;
    }
    if (!mapped) {
      skipped.push({
        subject: offender.subject,
        reason: 'no mappable test file',
      });
      ownerIssues.push({
        fingerprint: `deflake:flip:${createHash('sha256').update(offender.subject).digest('hex').slice(0, 16)}`,
        title: `Flake ledger: ${offender.flips} rerun flips of ${offender.subject}`,
        description: [
          `Subject: ${offender.subject}`,
          `Workflow: ${offender.workflowPath}`,
          `Flips in rolling 7d: ${offender.flips}`,
          `Heads: ${offender.heads.join(', ')}`,
          `Runs: ${runUrls(offender)}`,
          `First flip: ${offender.firstAt} Last flip: ${offender.lastAt}`,
          'Routed to the owning agent for this area (machine-filed, never Tim).',
        ].join('\n'),
      });
      continue;
    }
    const file =
      mapped.kind === 'unit' ? `apps/web/${mapped.path}` : mapped.path;
    const id = `auto-${createHash('sha256').update(file).digest('hex').slice(0, 16)}`;
    entries.push({
      entry: {
        id,
        ...mapped,
        owner: 'platform',
        firstSeenAt: offender.firstAt.slice(0, 10),
        reproductionCommand: reproductionCommandFor(mapped),
        fixIssueUrl: null,
        expiresAt: new Date(now + FLIP_QUARANTINE_CAP_DAYS * DAY)
          .toISOString()
          .slice(0, 10),
        quarantinedAt: nowIso,
        lastSeenFlakyAt: offender.lastAt,
        consecutiveSuccesses: 0,
        autoManaged: true,
      },
      evidence: offender,
      pendingIssue: {
        fingerprint: `deflake:flip:${id}`,
        title: `Flake ledger: ${offender.flips} rerun flips of ${file}`,
        description: [
          `Test file: ${file}`,
          `Flips in rolling 7d: ${offender.flips} (2+ same-(head, base) flips auto-quarantine)`,
          `Heads: ${offender.heads.join(', ')}`,
          `Runs: ${runUrls(offender)}`,
          `Evidence window first flip: ${offender.firstAt} last flip: ${offender.lastAt}`,
          'The test still runs non-blocking with alerts while quarantined; exit needs 50 clean executions after the last failure plus 7 stable days, or the 14-day age cap escalates to the owning agent (never Tim).',
        ].join('\n'),
      },
    });
  }
  return { entries, ownerIssues, escalations, skipped };
}

/**
 * Applies the plan: Linear owner issues, validated ledger mutation, draft
 * PR. The ledger evidence lives in the PR body so the quarantine is never
 * asserted without receipts.
 * @param {{
 *   ledger: object,
 *   quarantine: object,
 *   root?: string,
 *   now?: number,
 *   execute?: (command: string, args: string[], options?: object) => string,
 *   upsert?: (issue: object) => Promise<{ ok?: boolean, url?: string, identifier?: string }>,
 * }} input
 */
export async function applyFlipQuarantinePlan({
  ledger,
  quarantine,
  root = process.cwd(),
  now = Date.now(),
  execute = execFileSync,
  upsert = upsertLinearIssueByTitleFingerprint,
}) {
  const plan = buildFlipQuarantinePlan({
    offenders: repeatOffenders(ledger, { now }),
    quarantine,
    now,
  });
  fact(plan.entries.length > 0, 'No quarantine proposal to apply');
  for (const row of plan.entries) {
    // A quarantine entry needs a Linear URL before validateLedger accepts it;
    // the intake primitive resolves it (canonical URL or identifier fallback).
    const result = await upsert(row.pendingIssue);
    fact(
      result?.ok !== false,
      `Owner issue upsert failed: ${JSON.stringify(result)}`
    );
    const url =
      result?.url ??
      (result?.identifier
        ? `https://linear.app/jovie/issue/${result.identifier}`
        : null);
    fact(
      /^https:\/\/linear\.app\/jovie\/issue\/JOV-\d+/.test(url ?? ''),
      'Canonical Linear owner-issue URL required'
    );
    row.entry.fixIssueUrl = url;
  }
  const next = structuredClone(quarantine);
  for (const { entry } of plan.entries) next.entries.push(entry);
  writer.validateLedger(next);
  const ledgerPath = join(root, QUARANTINE_LEDGER);
  writeFileSync(ledgerPath, `${JSON.stringify(next, null, 2)}\n`);
  const run = (command, args) =>
    execute(command, args, { cwd: root, ...RUN_OPTS }).trim();
  const sourceHead = run('git', ['rev-parse', 'HEAD']);
  const branch = `${BRANCH_PREFIX}${sourceHead.slice(0, 12)}`;
  run('git', ['switch', '-c', branch]);
  run('git', ['add', '--', QUARANTINE_LEDGER]);
  run('git', [
    '-c',
    'user.name=Jovie Bot',
    '-c',
    'user.email=jovie-bot@users.noreply.github.com',
    'commit',
    '-m',
    'fix(tests): quarantine repeat flake-ledger offenders (2+ same-head-base flips in 7d)',
  ]);
  run('git', [
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
    'push',
    'origin',
    `HEAD:refs/heads/${branch}`,
  ]);
  const directory = mkdtempSync(join(tmpdir(), 'flip-quarantine-'));
  try {
    const bodyPath = join(directory, 'body.md');
    writeFileSync(
      bodyPath,
      [
        `Auto-quarantine from the JOV-13105 flake ledger at source ${sourceHead}.`,
        ...plan.entries.map(
          ({ entry, evidence }) =>
            `Added: ${entry.path} — ${evidence.flips} same-(head, base) rerun flips in 7d across heads ${evidence.heads.join(', ')}; runs ${evidence.failedRunIds.join(', ')}.`
        ),
        'Feeds the existing quarantine list (apps/web/tests/quarantine.json); no second list. The test still runs non-blocking with alerts while quarantined. Exit needs 50 clean executions after the last failure plus 7 stable days; the 14-day age cap escalates to the owning agent.',
        '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
      ].join('\n\n')
    );
    const url = run('gh', [
      'pr',
      'create',
      '--repo',
      REPO,
      '--base',
      'main',
      '--head',
      branch,
      '--draft',
      '--title',
      'fix(tests): quarantine repeat flake-ledger offenders',
      '--body-file',
      bodyPath,
    ]);
    fact(
      /^https:\/\/github\.com\/JovieInc\/Jovie\/pull\/[1-9]\d*$/.test(url),
      'Canonical draft quarantine receipt required'
    );
    // Escalations are returned, not auto-posted: posting to the owner issue
    // needs its Linear issue ID, which the workflow hook resolves through
    // the same intake primitive it used to create it.
    return {
      url,
      branch,
      sourceHead,
      added: plan.entries.map(x => x.entry.path),
      escalations: plan.escalations,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
