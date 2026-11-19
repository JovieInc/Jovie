#!/usr/bin/env node
/**
 * PR description fleet-rules findings: a thin wrapper around the ONE validator
 * the CI "PR Fleet Rules" / "Fleet Rules Evidence" checks run
 * (evaluateFleetRules in scripts/pr-fleet-rules.mjs). It adds no rules. It only
 *   - builds the `files` input from git (no GitHub REST call),
 *   - attaches a rule id and a fix hint to each message,
 *   - applies the shadow mode: off | warn | enforce (default warn).
 *
 * Self-contained on purpose (imports only ../pr-fleet-rules.mjs, which imports
 * only ./lib/wins-ledger.mjs and node builtins) so other repos can run it from a
 * pinned sparse checkout of JovieInc/Jovie, and Jovie can run it from the base
 * commit so a PR cannot weaken the copy that judges it.
 *
 * CI usage (pull_request opened|edited|reopened):
 *   node <dir>/scripts/lib/pr-body-fleet.mjs --ci [--repository owner/name]
 * Reads title/body/labels/author from $GITHUB_EVENT_PATH (never from argv or
 * shell interpolation) and files from `git diff HEAD^1 HEAD` on the merge ref.
 * Writes: ::warning annotations (no file/line, so no review threads), a job
 * summary table, and a JSON receipt (PR_BODY_LINT_RECEIPT) for hit-rate stats.
 * Exit: 0 in off/warn mode always; 1 only in enforce mode with errors.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { evaluateFleetRules } from '../pr-fleet-rules.mjs';

export const MODES = ['off', 'warn', 'enforce'];
/** GitHub's PR body limit; the validator is only ever fed bodies up to this size. */
export const MAX_BODY = 65_536;

/** Fix hints keyed by the rule id prefix evaluateFleetRules already emits. */
export const RULE_HINTS = {
  'red-before-green':
    'Add "## Red-before-green" with "- Failing command: <cmd>" and "- Failing run (before fix): <actions run URL>" (or a fenced red output containing FAIL/Error). Not a repair? Use a chore/ci/docs/refactor title and untick "Bug fix".',
  win: 'Add a "## Win" section with metric, before, after, method and evidence (compounding/throughput/CI/perf PRs).',
  'locked-areas':
    'Add "## Locked areas" with "GBrain: <slug/page>" or "Locking PR: #<number>" for each locked path.',
  'done-receipt':
    'Under "## Done receipt" cite "Merge-group run: <run id or URL>", or write "Not yet".',
  assertions:
    'Restore the weakened assertions and prove the repair with a failing-then-passing test.',
  'blast-radius':
    'Add "## Blast radius" with "What could break:" and "Proof:" (warning only).',
};

export function ruleId(message) {
  const m = /^([a-z][a-z-]*):/.exec(String(message));
  return m ? m[1] : 'other';
}

/**
 * Workflow-command escaping so PR-controlled text (titles, file paths with
 * newlines) can never start a new command line. Data: % CR LF. Properties
 * (title=) additionally : and ,.
 */
export function escapeCommand(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}
export function escapeProperty(value) {
  return escapeCommand(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** Escape for a markdown table cell in the job summary. */
export function escapeCell(value) {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .slice(0, 600);
}

/**
 * The exact CI validator, plus ids and hints.
 * @returns {{ errors: {rule:string,message:string,fix:string}[], warnings: {rule:string,message:string,fix:string}[] }}
 */
export function fleetFindings({
  title = '',
  body = '',
  labels = [],
  files = [],
  repository,
}) {
  const result = evaluateFleetRules({
    pr: { title, body, labels },
    files,
    repository,
  });
  const tag = message => {
    const rule = ruleId(message);
    return { rule, message, fix: RULE_HINTS[rule] ?? '' };
  };
  return { errors: result.errors.map(tag), warnings: result.warnings.map(tag) };
}

const STATUS = {
  A: 'added',
  M: 'modified',
  D: 'removed',
  R: 'renamed',
  C: 'copied',
  T: 'changed',
};

/**
 * GitHub-`pulls/files`-shaped list from git: filename, previous_filename,
 * status and patch (patch lets the assertion-strength rule run like CI).
 */
export function filesFromGit(base, head = 'HEAD', cwd = process.cwd()) {
  const git = args =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const parts = git(['diff', '--name-status', '-z', '-M', base, head]).split(
    '\0'
  );
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    if (!code) continue;
    const kind = code[0];
    const file = { status: STATUS[kind] ?? 'modified' };
    if (kind === 'R' || kind === 'C') {
      file.previous_filename = parts[i++];
      file.filename = parts[i++];
    } else {
      file.filename = parts[i++];
    }
    files.push(file);
  }
  for (const file of files) {
    if (file.status === 'removed') continue;
    try {
      const patch = git(['diff', '-M', base, head, '--', file.filename]);
      // GitHub omits very large patches; mirror that so verdicts match.
      if (patch && patch.length < 1_000_000)
        file.patch = patch.replace(/^[\s\S]*?\n@@/, '@@');
    } catch {
      /* leave patch undefined, as GitHub does */
    }
  }
  return files;
}

/**
 * Mode resolution. The committed config (read from the BASE commit by the
 * caller) is the source; the repo-variable override can only turn it OFF
 * (kill switch), never raise it to enforce.
 */
export function resolveMode({ configured = 'warn', override = '' } = {}) {
  const base = MODES.includes(configured) ? configured : 'warn';
  return override === 'off' ? 'off' : base;
}

function readConfiguredMode(cwd) {
  for (const ref of ['HEAD^1', 'HEAD']) {
    try {
      const raw = execFileSync(
        'git',
        ['show', `${ref}:.github/pr-body-lint.json`],
        {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      return JSON.parse(raw).mode ?? 'warn';
    } catch {
      /* try next */
    }
  }
  return 'warn';
}

export function runCi({
  env = process.env,
  cwd = process.cwd(),
  log = console.log,
  repository,
} = {}) {
  const mode = resolveMode({
    configured: readConfiguredMode(cwd),
    override: env.PR_BODY_LINT_MODE_OVERRIDE ?? '',
  });
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request ?? {};
  const repo =
    repository || event.repository?.full_name || env.GITHUB_REPOSITORY;
  const receipt = {
    schema: 'pr-body-lint/v1',
    repository: repo,
    pr: pr.number,
    action: event.action,
    author: pr.user?.login ?? '',
    authorType: pr.user?.type ?? '',
    fork: Boolean(pr.head?.repo?.fork),
    mode,
    filesSource: 'git',
    errors: [],
    warnings: [],
    at: new Date().toISOString(),
  };
  if (mode === 'off') {
    log('PR body lint is off (kill switch).');
    receipt.skipped = 'off';
    return { code: 0, receipt };
  }
  let files = [];
  try {
    files = filesFromGit('HEAD^1', 'HEAD', cwd);
  } catch {
    // Unmergeable PR (no merge ref parent) or shallow fetch: body-only verdict,
    // marked partial and excluded from promotion statistics.
    receipt.filesSource = 'unavailable';
    log(
      '::notice title=PR body lint::Changed files unavailable; path-based rules skipped (partial result).'
    );
  }
  const findings = fleetFindings({
    title: pr.title ?? '',
    body: pr.body ?? '',
    labels: pr.labels ?? [],
    files,
    repository: repo,
  });
  receipt.errors = findings.errors.map(f => f.rule);
  receipt.warnings = findings.warnings.map(f => f.rule);
  const level = mode === 'enforce' ? 'error' : 'warning';
  for (const f of findings.errors) {
    log(
      `::${level} title=${escapeProperty(`PR body ${f.rule}`)}::${escapeCommand(`${f.message} Fix: ${f.fix}`)}`
    );
  }
  for (const f of findings.warnings) {
    log(
      `::notice title=${escapeProperty(`PR body ${f.rule}`)}::${escapeCommand(f.message)}`
    );
  }
  if (env.GITHUB_STEP_SUMMARY) {
    const rows = [
      ...findings.errors.map(f => ['rule', f]),
      ...findings.warnings.map(f => ['advice', f]),
    ];
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      [
        `### PR body lint (${mode}) — same validator as PR Fleet Rules`,
        '',
        rows.length
          ? '| kind | rule | problem | how to fix |\n|---|---|---|---|\n' +
            rows
              .map(
                ([k, f]) =>
                  `| ${k} | ${escapeCell(f.rule)} | ${escapeCell(f.message)} | ${escapeCell(f.fix)} |`
              )
              .join('\n')
          : 'No fleet-rule violations in the PR description.',
        '',
        mode === 'warn'
          ? '_Advisory: this check never fails the PR and is not required._'
          : '',
        '',
      ].join('\n')
    );
  }
  if (env.PR_BODY_LINT_RECEIPT)
    writeFileSync(env.PR_BODY_LINT_RECEIPT, JSON.stringify(receipt) + '\n');
  return {
    code: mode === 'enforce' && findings.errors.length ? 1 : 0,
    receipt,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (!args.includes('--ci')) {
    console.error(
      'usage: pr-body-fleet.mjs --ci [--repository owner/name]  (local use: scripts/pr-body-lint.mjs)'
    );
    process.exit(2);
  }
  const i = args.indexOf('--repository');
  try {
    process.exitCode = runCi({
      repository: i >= 0 ? args[i + 1] : undefined,
    }).code;
  } catch (error) {
    // Advisory infrastructure failure is never a verdict on the PR.
    console.log(
      `::warning title=PR body lint unavailable::${escapeCommand(error?.message ?? 'unknown error')}`
    );
    process.exitCode = 0;
  }
}
