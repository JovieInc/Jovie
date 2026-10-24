#!/usr/bin/env node
// One policy for PR feedback, native admission, and durable delivery receipts.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RUN_URL =
  /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/([1-9]\d*)(?:\/attempts\/[1-9]\d*)?$/;
const REPAIR_LABELS = new Set([
  'bug',
  'type:bug',
  'ci-repair',
  'ci-fix',
  'ws:ci',
  'remediation',
  'lane-fix-red',
  'lane-fix-dequeued',
]);
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
  const start = lines.findIndex(
    line =>
      /^#{1,6}\s/.test(line) &&
      line
        .replace(/^#+\s*/, '')
        .trim()
        .toLowerCase() === heading.toLowerCase()
  );
  if (start < 0) return '';
  const end = lines.findIndex(
    (line, index) => index > start && /^#{1,6}\s/.test(line)
  );
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
        'red-before-green: include Failing command: plus a red-output fence or Failing run (before fix): <URL>.'
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
      `locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> in Locked areas for ${[...new Set(locked)].join(', ')}.`
    );
  return { errors, warnings };
}

/** Refresh metadata on edits/labels; never interpolate PR content into shell. */
export async function runFleetRules({ event, request }) {
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
  const pr = await request(path);
  if (pr.head?.sha !== event.pull_request.head?.sha)
    throw new Error('PR head changed; fresh event required');
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await request(`${path}/files?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('incomplete PR files');
    files.push(...batch);
    if (batch.length < 100) break;
  }
  if (
    files.length !== pr.changed_files ||
    files.some(file => typeof file.filename !== 'string')
  )
    throw new Error('incomplete PR file count');
  const current = await request(path);
  if (
    current.head?.sha !== pr.head.sha ||
    current.changed_files !== files.length
  )
    throw new Error('PR head or files changed during read');
  return evaluateFleetRules({ pr: current, files, repository });
}

export async function githubRequest(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`GitHub evidence request failed (${response.status})`);
  return response.json();
}
export async function main({
  args = process.argv.slice(2),
  env = process.env,
  request = githubRequest,
  log = console.log,
} = {}) {
  const warningOnly = args.includes('--warnings-only');
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await runFleetRules({ event, request });
    const annotation = value =>
      value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    for (const message of warningOnly ? result.warnings : result.errors)
      log(`::${warningOnly ? 'warning' : 'error'}::${annotation(message)}`);
    return warningOnly || result.errors.length === 0 ? 0 : 1;
  } catch {
    // Never print API bodies or request errors containing credentials/PR data.
    log(
      `::${warningOnly ? 'warning' : 'error'}::Fleet rule evidence unavailable; re-run with current PR metadata.`
    );
    return warningOnly ? 0 : 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
