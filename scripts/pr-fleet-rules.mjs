#!/usr/bin/env node
// One policy for PR feedback, native admission, and durable delivery receipts.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { requiredWinErrors, winSectionErrors } from './lib/wins-ledger.mjs';

const RUN_URL =
  /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/([1-9]\d*)(?:\/attempts\/[1-9]\d*)?$/;
const REPAIR_LABELS = new Set([
  'bug',
  'type:bug',
  'ci-repair',
  'ci-fix',
  'ws:ci',
  'remediation',
]);
// lane-fix-* labels are lane bookkeeping applied after any red check; only the PR's own declared intent (fix: title, bug-fix checkbox, repair labels a human/author chose) triggers red-before-green.
const EXEMPT_LABELS = new Set(['ios-ci', 'visual-regression']);
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$)/;
const ASSERTION = /\b(?:expect\s*\(|assert[.(]|assert\s)/;
const BROAD_ASSERTION =
  /\.(?:toBeDefined|toBeTruthy|toBeFalsy|toBeGreaterThanOrEqual|toBeLessThanOrEqual|toMatchObject|toContain)\s*\(/;
const stripComments = body => (body ?? '').replace(/<!--[\s\S]*?-->/g, '');
const text = value =>
  typeof value === 'string' &&
  value.trim().length > 2 &&
  !/^(?:todo|tbd|n\/?a|none|not applicable|\.\.\.|<[^>]*>)\s*[.!]?$/i.test(
    value.trim()
  );

export function section(body, heading) {
  const lines = stripComments(body).split('\n');
  // A "# ..." line inside a code fence (shell comment, markdown in a log) is
  // not a heading, so it must not start or end a section.
  let fenced = false;
  const isHeading = lines.map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced && /^#{1,6}\s/.test(line);
  });
  const start = lines.findIndex(
    (line, index) =>
      isHeading[index] &&
      line
        .replace(/^#+\s*/, '')
        .trim()
        .toLowerCase() === heading.toLowerCase()
  );
  if (start < 0) return '';
  const end = isHeading.findIndex((is, index) => index > start && is);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}
function field(body, label) {
  const match = body.match(
    new RegExp(`^\\s*(?:-\\s*)?${label}:\\s*(.+)$`, 'im')
  );
  return match?.[1]?.trim() ?? '';
}
function runReference(value, repository) {
  if (/^[1-9]\d*$/.test(String(value ?? ''))) return true;
  const match = RUN_URL.exec(value ?? '');
  return (
    !!match &&
    (!repository || match[1].toLowerCase() === repository.toLowerCase())
  );
}

/** A hold/external-blocked receipt is terminal but never a Done receipt. */
export function validateDoneReceipt(receipt) {
  if (
    !['done', 'production-proven'].includes(
      String(receipt.stage ?? receipt.status ?? '').toLowerCase()
    )
  )
    return [];
  const run =
    receipt.mergeGroupRun ??
    receipt.transition?.mergeGroupRun ??
    receipt.event?.evidence?.mergeGroupRun;
  return run?.event === 'merge_group' &&
    (runReference(run.id, receipt.event?.repository) ||
      (RUN_URL.test(run.url ?? '') &&
        runReference(run.url, receipt.event?.repository)))
    ? []
    : [
        'done-receipt: Done requires a merge_group workflow run id or URL (mergeGroupRun.event=merge_group).',
      ];
}

export function hasPremiseEvidence(body) {
  const premise = section(body, 'Premise check');
  return ['Assumption', 'Falsifying test', 'Result'].every(label =>
    text(field(premise, label))
  );
}
export function isLockedArea(path) {
  // Actual homepage copy owners; include inline locked hero/section copy too.
  return (
    /(?:^|\/)design-system\.css$/.test(path) ||
    /(?:^|\/)(?:auth|\(auth\)|auth-routing|clerk)(?:\/|[.-])/.test(path) ||
    /(?:^|\/)[^/]*(?:clerk|better-auth)[^/]*\.[cm]?[jt]sx?$/.test(path) ||
    (/\.json$/.test(path) && /(?:baseline|ratchet)/i.test(path)) ||
    /^apps\/web\/data\/(?:homepageV2Copy|homepageFrontDoorCta|marketingCtaIntents)\.ts$/.test(
      path
    ) ||
    /^apps\/web\/components\/homepage\/(?:HomepageEditorialHero|HomepageCertifiedSections)\.tsx$/.test(
      path
    )
  );
}

/** Conservative flag for test-only weakening: removed assertions, broad replacements,
 * or newly skipped tests, without a replacement of equal/greater specificity.
 * This is a flag for a reviewable class, not a semantic proof about arbitrary code. */
export function onlyWeakensAssertions(files) {
  if (
    !files.length ||
    files.some(
      file => file.status === 'added' || !TEST_FILE.test(file.filename)
    )
  )
    return false;
  let weakened = false;
  for (const file of files) {
    const lines = (file.patch ?? '').split('\n');
    const removed = lines
      .filter(line => line.startsWith('-') && !line.startsWith('---'))
      .map(line => line.slice(1));
    const added = lines
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1));
    if (added.some(line => ASSERTION.test(line) && !BROAD_ASSERTION.test(line)))
      return false;
    if (
      added.some(line =>
        /\b(?:it|test|describe)\.(?:skip|todo)|@pytest\.mark\.(?:skip|xfail)/.test(
          line
        )
      ) ||
      removed.some(line => ASSERTION.test(line))
    )
      weakened = true;
    // Any substantive non-assertion addition could implement a genuine test repair.
    if (
      added.some(
        line =>
          line.trim() &&
          !ASSERTION.test(line) &&
          !/\b(?:it|test|describe)\.(?:skip|todo)/.test(line) &&
          !/^[\s});,]+$/.test(line) &&
          !/^\s*(?:\/\/|#)/.test(line)
      )
    )
      return false;
  }
  return weakened;
}

export function evaluateFleetRules({
  pr,
  files,
  repository = 'JovieInc/Jovie',
}) {
  const errors = [],
    warnings = [];
  const body = stripComments(pr.body);
  const labels = (pr.labels ?? []).map(label =>
    (typeof label === 'string' ? label : label.name).toLowerCase()
  );
  const paths = files.flatMap(file =>
    [file.filename, file.previous_filename].filter(Boolean)
  );
  const done = section(body, 'Done receipt');
  if (
    done.trim() &&
    !/^(?:not yet|pending|n\/a|not applicable)\b/i.test(done.trim())
  ) {
    const run = field(done, 'Merge-group run').replace(/`/g, '');
    if (!runReference(run, repository))
      errors.push(
        'done-receipt: cite Merge-group run: <run id or URL> before claiming Done.'
      );
  }
  const repair =
    /^fix(?:\([^\n)]+\))?!?:/i.test(pr.title ?? '') ||
    labels.some(label => REPAIR_LABELS.has(label)) ||
    /- \[x\] Bug fix/i.test(body);
  const exempt =
    labels.some(label => EXEMPT_LABELS.has(label)) ||
    (paths.length > 0 &&
      paths.every(path =>
        /^(?:apps\/ios\/|\.github\/workflows\/ios-ci\.yml$|apps\/web\/tests\/visual\/|\.github\/workflows\/visual(?:-regression|-a11y)\.yml$|apps\/web\/tests\/e2e\/(?:[^/]*visual[^/]*|storybook-elevation)\.spec\.ts$)|(?:^|\/)__(?:screenshots|snapshots)__\/|\.snap$/.test(
          path
        )
      ));
  const red = section(body, 'Red-before-green');
  if (repair && !exempt) {
    const command = field(red, 'Failing command').replace(/`/g, '');
    const output =
      /```(?:text|console|log|bash|sh)?\n[\s\S]*?\b(?:FAIL|Error|AssertionError|ERR_|expected|not ok)[\s\S]*?```/i.test(
        red
      );
    const link = field(red, 'Failing run \\(before fix\\)').replace(/`/g, '');
    if (!text(command) || (!output && !RUN_URL.test(link)))
      errors.push(
        `red-before-green: ${
          red.trim()
            ? 'the "## Red-before-green" section is present but incomplete'
            : 'this repair PR has no "## Red-before-green" section'
        }${text(command) ? '' : '; missing "- Failing command: <cmd>"'}${
          output || RUN_URL.test(link)
            ? ''
            : '; missing "- Failing run (before fix): <https://github.com/JovieInc/Jovie/actions/runs/ID URL>" (or a red-output fence containing FAIL/Error). Exact format: a "## Red-before-green" heading, then the lines "- Failing command: <cmd>" and "- Failing run (before fix): <URL>"'
        }. Not a repair? Use a non-fix title (chore/ci/docs/refactor) and drop the bug-fix checkbox.`
      );
  }
  if (
    repair &&
    !exempt &&
    files.some(
      file =>
        TEST_FILE.test(file.filename) &&
        file.status !== 'added' &&
        typeof file.patch !== 'string'
    )
  )
    errors.push(
      'assertions: existing test patch unavailable; assertion-strength review cannot be completed.'
    );
  if (
    (repair || /red[- ](?:before[- ]green|to[- ]green)/i.test(body)) &&
    !exempt &&
    onlyWeakensAssertions(files)
  )
    errors.push(
      'assertions: red-to-green diff only weakens existing tests; restore assertions and prove the repair.'
    );
  for (const message of winSectionErrors(body)) errors.push(`win: ${message}`);
  errors.push(...requiredWinErrors({ title: pr.title, labels, body }));
  const blast = section(body, 'Blast radius');
  if (!text(field(blast, 'What could break')) || !text(field(blast, 'Proof')))
    warnings.push(
      'blast-radius: describe what could break outside the diff and provide proof.'
    );
  const locked = paths.filter(isLockedArea);
  const reference = section(body, 'Locked areas');
  const brain = field(reference, 'GBrain').replace(/`/g, '');
  const citation =
    (text(brain) && /^https:\/\/[^\s<>]+$/.test(brain)) ||
    (text(brain) && /^(?:gbrain:\/\/)?[a-z0-9][a-z0-9/_-]{2,}$/i.test(brain)) ||
    /https:\/\/(?:gbrain\.[\w.-]+|[^\s/]+\/gbrain)\/[^\s<>]+/i.test(
      reference
    ) ||
    /\bLocking PR:\s*(?:#[1-9]\d*|https:\/\/github\.com\/JovieInc\/Jovie\/pull\/[1-9]\d*)(?:\s|$)/im.test(
      reference
    );
  if (locked.length && !citation)
    errors.push(
      `locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> in Locked areas for ${[...new Set(locked)].join(', ')}. Add to the PR body: "## Locked areas\nGBrain: design/design-operating-system" (design-system.css and design baselines) or "Locking PR: #<number>".`
    );
  return { errors, warnings };
}

/** Refresh metadata on edits/labels; never interpolate PR content into shell. */
export async function runFleetRules({ event, request, fromEvent = false }) {
  // This policy concerns source PR metadata; synthetic heads have no PR body.
  // Source PR Ready and native admission independently enforce the same policy.
  if (event.merge_group) return { errors: [], warnings: [] };
  const repository = event.repository?.full_name;
  const number = event.pull_request?.number;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') ||
    !Number.isSafeInteger(number) ||
    number < 1
  )
    throw new Error('PR event metadata missing');
  const path = `/repos/${repository}/pulls/${number}`;
  // Two reads, not three: the files, then the PR once. The event's own head
  // sha is the baseline the old first PR read only copied, and one PR read
  // after the files still proves the head did not move and the file count is
  // complete. Saves one GITHUB_TOKEN call per PR event (~590 runs/hour).
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await request(`${path}/files?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('incomplete PR files');
    files.push(...batch);
    if (batch.length < 100) break;
  }
  // Advisory runs trust the event's own PR object (body, labels, title, head,
  // changed_files all ship in the payload): a later edit or push fires a new
  // event, so this saves the second API call per PR event.
  const current = fromEvent ? event.pull_request : await request(path);
  if (current.head?.sha !== event.pull_request.head?.sha)
    throw new Error('PR head changed; fresh event required');
  if (
    files.length !== current.changed_files ||
    files.some(file => typeof file.filename !== 'string')
  )
    throw new Error('incomplete PR file count');
  return evaluateFleetRules({ pr: current, files, repository });
}

/**
 * @param {string} path
 * @param {{ store?: import('../packages/api-client/store.ts').LedgerStore }} [options]
 */
export async function githubRequest(path, { store } = {}) {
  // Pure policy consumers do not need to load the network client.
  const { createGitHubClient } = await import(
    '../packages/api-client/github.ts'
  );
  const response = await createGitHubClient({
    token: process.env.GITHUB_TOKEN,
    store,
  }).rest('GET', path, undefined, {
    priority: 'merge',
    timeoutMs: 15000,
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`GitHub evidence request failed (${response.status})`);
  return response.json();
}
// The api-client has already retried inside its own deadline when it throws an
// exhausted/shed/budget ApiError, so these are GitHub quota or outage answers,
// never a verdict on the PR.
const INFRA_FAILURES = new Set(['primary', 'secondary', 'transient']);
const EX_TEMPFAIL = 75;
// Printed in the failed step so the lane relay's shared classifier
// (scripts/lib/github-rate-limit.mjs) reads it as quota and re-runs the check
// instead of queueing repair work.
const QUOTA_DEFERRED_MARKER = 'github-quota-deferred';
// Total time one run may spend waiting out a quota/outage answer. Waits use the
// reset header when it fits the remaining budget, else a doubling backoff.
const DEFAULT_QUOTA_HOLD_SECONDS = 120;
const BACKOFF_BASE_MS = 15_000;

/** @returns {{ infra: boolean, retryAtMs: number | null }} */
function classifyEvidenceFailure(error) {
  const infra =
    error?.exitCode === EX_TEMPFAIL || INFRA_FAILURES.has(error?.failure);
  const retryAt = Number(error?.retryAt);
  return {
    infra,
    retryAtMs:
      infra && Number.isFinite(retryAt) && retryAt > 0 ? retryAt : null,
  };
}

const annotation = value =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export async function main({
  args = process.argv.slice(2),
  env = process.env,
  request = githubRequest,
  log = console.log,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const warningOnly = args.includes('--warnings-only');
  // One evidence read can print warnings and enforce errors, so a job that
  // needs both spends the installation budget once, not twice.
  const withWarnings = args.includes('--with-warnings');
  const holdSeconds = Number(env.FLEET_RULES_QUOTA_HOLD_SECONDS);
  const holdMs =
    (Number.isFinite(holdSeconds) && holdSeconds >= 0
      ? holdSeconds
      : DEFAULT_QUOTA_HOLD_SECONDS) * 1000;
  // Advisory: the pull_request-triggered copy of this check duplicates the
  // authoritative Fleet Rules Evidence verdict (CI App budget, read by PR
  // Ready). Quota there is infrastructure, so it is annotated, never red.
  const advisory = args.includes('--advisory');
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    let result;
    let heldMs = 0;
    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await runFleetRules({ event, request, fromEvent: advisory });
        break;
      } catch (error) {
        const { infra, retryAtMs } = classifyEvidenceFailure(error);
        if (!infra || warningOnly) throw error;
        const waitMs = Math.max(
          retryAtMs === null
            ? BACKOFF_BASE_MS * 2 ** (attempt - 1)
            : retryAtMs - now() + 1000,
          0
        );
        // Hold while the wait fits the remaining budget; a reset past it is
        // reported below and never passes as a verdict.
        if (heldMs + waitMs > holdMs) throw error;
        heldMs += waitMs;
        log(
          `::notice title=GitHub API hold::Holding ${Math.ceil(
            waitMs / 1000
          )}s (attempt ${attempt}) for the GitHub quota before reading PR evidence.`
        );
        await sleep(waitMs);
      }
    }
    if (withWarnings || warningOnly)
      for (const message of result.warnings)
        log(`::warning::${annotation(message)}`);
    if (!warningOnly)
      for (const message of result.errors)
        log(`::error::${annotation(message)}`);
    return warningOnly || result.errors.length === 0 ? 0 : 1;
  } catch (error) {
    // Never print API bodies or request errors containing credentials/PR data.
    if (!warningOnly && classifyEvidenceFailure(error).infra) {
      if (advisory) {
        log(
          `::warning title=Infrastructure, not a verdict::Fleet rule evidence unavailable: GitHub API quota or outage (${QUOTA_DEFERRED_MARKER}). Fleet Rules Evidence is the authoritative verdict; this advisory copy does not fail.`
        );
        return 0;
      }
      log(
        `::error::Fleet rule evidence unavailable: GitHub API quota or outage (${QUOTA_DEFERRED_MARKER}); not a verdict on this PR. Re-run after the quota resets.`
      );
      return EX_TEMPFAIL;
    }
    log(
      `::${warningOnly ? 'warning' : 'error'}::Fleet rule evidence unavailable; re-run with current PR metadata.`
    );
    return warningOnly ? 0 : 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
