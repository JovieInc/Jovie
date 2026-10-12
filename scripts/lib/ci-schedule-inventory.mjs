import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as yamlLoad } from 'js-yaml';

export const SCHEDULE_CLASSES = Object.freeze([
  'skip-if-unchanged',
  'production-liveness',
  'temporal-resource',
  'upstream-advisory',
]);

export const EVIDENCE_DRIVEN_WORKFLOWS = Object.freeze([
  '.github/workflows/codeql.yml',
  '.github/workflows/e2e-full-matrix.yml',
  '.github/workflows/eval-real-model.yml',
  '.github/workflows/nightly-testing-agent.yml',
  '.github/workflows/nightly-tests.yml',
  // security.yml intentionally keeps a weekly upstream-advisory baseline
  // (JOV-7565): dependency/OSV advisories publish on their own clock, so a
  // purely causal trigger can miss new findings on unchanged source.
  '.github/workflows/sonarcloud.yml',
  '.github/workflows/test-coverage-audit.yml',
  '.github/workflows/test-flakiness-report.yml',
]);

const WORKFLOW_FILE_RE = /\.ya?ml$/;
const CRON_RE = /^\s*-\s*cron:/m;
const CLASS_RE = /^\s*#\s*clock-class:\s+(\S+)\s*$/m;
const CAUSAL_TRIGGER_RE =
  /^  (?:push|workflow_run|repository_dispatch|deployment_status):/m;

export function parseScheduleClass(source = '') {
  return String(source).match(CLASS_RE)?.[1] ?? null;
}

export function hasCronSchedule(source = '') {
  return CRON_RE.test(String(source));
}

export function inventoryScheduledWorkflows(files = []) {
  const errors = [];
  const rows = [];
  const evidenceDriven = new Set(EVIDENCE_DRIVEN_WORKFLOWS);
  for (const file of files) {
    const path = file.path;
    const source = String(file.source ?? '');
    if (evidenceDriven.has(path)) {
      if (hasCronSchedule(source)) {
        errors.push(
          `${path}: broad evidence workflow must not run from a cron schedule`
        );
      }
      if (!CAUSAL_TRIGGER_RE.test(source)) {
        errors.push(
          `${path}: broad evidence workflow requires a causal event trigger`
        );
      }
    }
    if (!hasCronSchedule(source)) continue;
    const scheduleClass = parseScheduleClass(source);
    rows.push({ path, scheduleClass });
    if (!SCHEDULE_CLASSES.includes(scheduleClass)) {
      errors.push(
        `${path}: scheduled workflow must declare # clock-class: ${SCHEDULE_CLASSES.join('|')} (got ${scheduleClass ?? 'missing'})`
      );
    }
  }
  return { rows, errors };
}

export function loadWorkflowFiles(workflowsDir) {
  return readdirSync(workflowsDir)
    .filter(name => WORKFLOW_FILE_RE.test(name))
    .sort()
    .map(name => ({
      path: `.github/workflows/${name}`,
      source: readFileSync(join(workflowsDir, name), 'utf8'),
    }));
}

// ---------------------------------------------------------------------------
// JOV-INV-042: admission and landing are event-driven only.
//
// The Gem lanes tick (scripts/lanes/) is the only scheduler for PR, merge-queue,
// issue, and label state. GitHub cron is for measurement and scans, and only
// for the workflows frozen below. Every list here is debt that ratchets down:
// a removed cron must delete its entry, and no entry may be added.
// ---------------------------------------------------------------------------

export const EVENT_DRIVEN_INVARIANT_ID = 'JOV-INV-042';

const EVENT_DRIVEN_FIX = `use pull_request/pull_request_target/merge_group/workflow_run/check_suite/repository_dispatch triggers or extend the Gem lanes tick (scripts/lanes/); see canon invariant ${EVENT_DRIVEN_INVARIANT_ID}`;

/**
 * Every workflow that still runs from a GitHub cron on 2026-10-11. Frozen:
 * a cron in any other workflow fails, and an entry whose workflow no longer
 * has a cron fails until it is deleted. The ceiling below only goes down.
 */
/** @type {readonly string[]} */
export const CRON_ALLOWLIST = Object.freeze([
  '.github/workflows/agent-harness-health-report.yml',
  '.github/workflows/auto-merge-default.yml',
  '.github/workflows/brand-scrub.yml',
  '.github/workflows/ci-duration-ratchet.yml',
  '.github/workflows/cli-chaos-nightly.yml',
  '.github/workflows/cost-anomaly-gate.yml',
  '.github/workflows/deepsec-native.yml',
  '.github/workflows/deprecation-intake.yml',
  '.github/workflows/design-governance.yml',
  '.github/workflows/desktop-release.yml',
  '.github/workflows/doc-gardening-agent.yml',
  '.github/workflows/fleet-gate-refresh.yml',
  '.github/workflows/golden-path-nightly.yml',
  '.github/workflows/m2-revenue-path-canary.yml',
  '.github/workflows/mac-runner-heartbeat.yml',
  '.github/workflows/marketing-certification-producer.yml',
  '.github/workflows/merge-queue-green-enroll.yml',
  '.github/workflows/merge-queue-ruleset-verify.yml',
  '.github/workflows/neon-scheduled-cleanup.yml',
  '.github/workflows/node-runtime-compatibility.yml',
  '.github/workflows/node-runtime-freshness.yml',
  '.github/workflows/pr-review-learn.yml',
  '.github/workflows/production-continuity.yml',
  '.github/workflows/production-controller-health.yml',
  '.github/workflows/public-benchmark.yml',
  '.github/workflows/quarantine-recovery.yml',
  '.github/workflows/remediation-sweep.yml',
  '.github/workflows/runner-health-monitor.yml',
  '.github/workflows/runner-heartbeat.yml',
  '.github/workflows/security-suppression-audit.yml',
  '.github/workflows/security.yml',
  '.github/workflows/sentry-autofix-recurrence.yml',
  '.github/workflows/shipping-slo.yml',
  '.github/workflows/summer-eve-pin.yml',
  '.github/workflows/synthetic-monitoring.yml',
  '.github/workflows/visual-a11y.yml',
  '.github/workflows/visual-regression.yml',
  '.github/workflows/voc-mine.yml',
]);
export const CRON_ALLOWLIST_CEILING = 38;

/**
 * Scheduled workflows that can change PR, merge-queue, issue, or label state.
 * Each names the event-driven replacement that removes its cron. No entry may
 * be added; the ceiling below only goes down.
 */
/** @type {Readonly<Record<string, {reason: string, replacement: string}>>} */
export const ADMISSION_CRON_DEBT = Object.freeze({
  '.github/workflows/auto-merge-default.yml': Object.freeze({
    reason:
      'hourly triage sweep enables missing auto-merge and comments on stuck PRs',
    replacement:
      'pull_request ready_for_review/synchronize enable path plus dependabot-auto-merge.yml; missed events go to the Gem lanes tick',
  }),
  '.github/workflows/desktop-release.yml': Object.freeze({
    reason:
      'daily staging desktop build in the same workflow that opens and labels the release stamp PR',
    replacement:
      'staging builds from the existing Production Controller workflow_run trigger; drop the daily clock',
  }),
  '.github/workflows/fleet-gate-refresh.yml': Object.freeze({
    reason:
      '*/5 rewrite keeps the Gem fleet-gate receipt (issue admission) inside its stale window',
    replacement:
      'Gem lanes tick emits the receipt natively (its removal-trigger); push and repository_dispatch stay',
  }),
  '.github/workflows/merge-queue-green-enroll.yml': Object.freeze({
    reason:
      '*/15 full reconcile re-arms green PRs whose completion events were missed',
    replacement:
      'Gem lanes enroll backstop dispatching repository_dispatch enroll-reconcile (PR #21291)',
  }),
});
export const ADMISSION_CRON_DEBT_CEILING = 4;

/**
 * Workflow steps that hold a runner polling GitHub, git, or queue state. Keyed
 * `<workflow path>#<job id>`. No entry may be added; the ceiling only goes down.
 */
/** @type {Readonly<Record<string, string>>} */
export const POLLING_DEBT = Object.freeze({
  '.github/workflows/auto-merge-default.yml#self-test':
    'manual self-test rereads autoMergeRequest 12 times for 60 s',
  '.github/workflows/auto-pr-on-push.yml#open-pr':
    'waits up to 6 min for open agent PRs to drop below the rate limit',
  '.github/workflows/golden-path-nightly.yml#golden-path':
    'dispatches ci.yml then waits up to 80 min for that run to complete',
  '.github/workflows/pr-conflict-handler.yml#record_cohort':
    'polls candidate CI runs until a deadline to record cohort outcomes',
  '.github/workflows/production-controller.yml#coalesce-production':
    'sleeps up to the coalescing cap scaled by merge-queue depth before rereading main',
});
export const POLLING_DEBT_CEILING = 5;

/**
 * Mutations that change PR, merge-queue, issue, or label state. A workflow is
 * admission/landing when its own text, or a local script it runs, contains one.
 * scripts/lib/linear-issue-intake.mjs is the measurement finding intake (file,
 * reopen, or resolve one fingerprinted issue per finding); it is not admission.
 */
/** @type {ReadonlyArray<readonly [string, RegExp]>} */
export const ADMISSION_SIGNALS = Object.freeze([
  ['merge-queue enqueue/dequeue', /\b(?:en|de)queuePullRequest\b/],
  [
    'auto-merge or merge',
    /\b(?:enable|disable)PullRequestAutoMerge\b|\bgh pr merge\b|\bpulls\.merge\b/,
  ],
  [
    'ready/draft transition',
    /\bgh pr ready\b|\bmarkPullRequestReadyForReview\b|\bconvertPullRequestToDraft\b/,
  ],
  [
    'PR or issue label mutation',
    /\bgh (?:pr|issue) edit\b[^\n]*--(?:add|remove)-label\b|\bissues\.(?:addLabels|removeLabel|setLabels)\b|\b(?:add|remove)LabelsTo(?:From)?Labelable\b|\bremoveLabelsFromLabelable\b/,
  ],
  ['Linear issue state mutation', /\bissueUpdate\b/],
  ['Gem lanes', /\bscripts\/lanes\//],
]);
const MEASUREMENT_INTAKE = new Set(['scripts/lib/linear-issue-intake.mjs']);
const LOCAL_SCRIPT_RE =
  /(?:^|[\s"'=(])\.?\/?((?:\.github\/scripts|scripts)\/[\w./-]+\.(?:mjs|cjs|js|ts|py|sh))/g;

function stripYamlComments(source) {
  return String(source)
    .split('\n')
    .filter(line => !/^\s*#/.test(line))
    .join('\n');
}

/**
 * @param {string} [source]
 * @param {(path: string) => string | null} [readScript]
 */
export function admissionSignals(source = '', readScript = () => null) {
  const text = stripYamlComments(source);
  const texts = [text];
  for (const match of text.matchAll(LOCAL_SCRIPT_RE)) {
    if (MEASUREMENT_INTAKE.has(match[1])) continue;
    const script = readScript(match[1]);
    if (script) texts.push(script);
  }
  return ADMISSION_SIGNALS.filter(([, re]) => texts.some(t => re.test(t))).map(
    ([label]) => label
  );
}

// --- Polling -----------------------------------------------------------------

const GITHUB_STATE_RE =
  /\bgh (?:api|run|pr)\b|\bgh_api\b|\bgit ls-remote\b|api\.github\.com|\bgithub\.(?:rest|graphql|request|paginate)\b/;
const WATCH_RE = /\bgh run watch\b|\bgh pr checks\b[^\n]*--watch\b/;
const MAX_BOUNDED_RETRY_ATTEMPTS = 5;
const MAX_HELD_SLEEP_SECONDS = 60;

function stripShellComment(line) {
  return line.replace(/(?:^|\s)#(?![{!]).*$/, '');
}

function countWords(line, word) {
  return (
    line.match(new RegExp(`(?:^|[\\s;&|])${word}(?=$|[\\s;)|&])`, 'g')) || []
  ).length;
}

/** Shell loops: header line plus body through the matching `done`. */
export function shellLoops(script = '') {
  const lines = String(script).split('\n').map(stripShellComment);
  const loops = [];
  for (let start = 0; start < lines.length; start += 1) {
    const header = lines[start].match(/(?:^|[|;&]\s*)(while|until|for)\s/);
    if (!header) continue;
    let depth = 0;
    let end = start;
    for (; end < lines.length; end += 1) {
      depth += countWords(lines[end], 'do') - countWords(lines[end], 'done');
      if (depth <= 0 && (end > start || countWords(lines[end], 'done'))) break;
    }
    loops.push({
      kind: header[1],
      header: lines[start].trim(),
      body: lines.slice(start, end + 1).join('\n'),
    });
  }
  return loops;
}

/** Literal attempt count of a `for` header, or null when it is not literal. */
export function forLoopAttempts(header = '') {
  const list = header.match(/\bfor\s+\w+\s+in\s+(.+?)(?:;\s*do\b|$)/)?.[1];
  if (!list) return null;
  const seq = list.match(/^\$\(seq\s+(?:(\d+)\s+)?(\d+)\)$/);
  if (seq) return Number(seq[2]) - Number(seq[1] ?? 1) + 1;
  const range = list.match(/^\{(\d+)\.\.(\d+)\}$/);
  if (range) return Number(range[2]) - Number(range[1]) + 1;
  if (/[$`*{]/.test(list)) return null;
  return list.trim().split(/\s+/).length;
}

function heldSleep(script) {
  for (const match of String(script).matchAll(
    /\bsleep\s+("?\$[\w{}()*+ -]+"?|\d+)/g
  )) {
    const value = match[1];
    if (!/^\d+$/.test(value) || Number(value) >= MAX_HELD_SLEEP_SECONDS)
      return true;
  }
  return false;
}

/** Reasons a single step holds a runner polling GitHub, git, or queue state. */
export function pollingFindings(step = {}) {
  const findings = [];
  const run = typeof step.run === 'string' ? step.run : '';
  if (WATCH_RE.test(run)) findings.push('watches a run or check to completion');
  let outsideRetries = run.split('\n').map(stripShellComment).join('\n');
  for (const loop of shellLoops(run)) {
    const attempts = loop.kind === 'for' ? forLoopAttempts(loop.header) : null;
    if (attempts !== null && attempts <= MAX_BOUNDED_RETRY_ATTEMPTS) {
      // A capped retry of one transient call may back off between attempts.
      outsideRetries = outsideRetries.replace(loop.body, '');
      continue;
    }
    if (/\bsleep\b/.test(loop.body) && GITHUB_STATE_RE.test(loop.body)) {
      findings.push(`polls GitHub state in \`${loop.header.slice(0, 80)}\``);
    }
  }
  if (
    !findings.length &&
    GITHUB_STATE_RE.test(run) &&
    heldSleep(outsideRetries)
  ) {
    findings.push(
      'holds the runner in a long sleep before rereading GitHub state'
    );
  }
  const script = typeof step.with?.script === 'string' ? step.with.script : '';
  if (
    /\bwhile\s*\(|\bfor\s*\(\s*;\s*;/.test(script) &&
    /\bsetTimeout\b|\bsleep\(/.test(script) &&
    GITHUB_STATE_RE.test(script)
  ) {
    findings.push('polls GitHub state from a github-script loop');
  }
  return findings;
}

export function inventoryPolling(files = []) {
  const rows = [];
  for (const file of files) {
    /** @type {any} */
    let doc;
    try {
      doc = yamlLoad(String(file.source ?? ''));
    } catch {
      continue;
    }
    for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
      const findings = (job?.steps ?? []).flatMap(step =>
        pollingFindings(step)
      );
      if (findings.length)
        rows.push({ key: `${file.path}#${jobId}`, findings });
    }
  }
  return rows;
}

// --- Event-driven contract ------------------------------------------------------

function ratchet(errors, label, entries, detected, ceiling, fix) {
  const listed = new Set(entries);
  for (const key of detected) {
    if (!listed.has(key)) errors.push(`${key}: ${label.added(key)}; ${fix}`);
  }
  for (const key of listed) {
    if (!detected.has(key)) {
      errors.push(
        `${key}: ${label.stale}; delete its entry so the debt list shrinks`
      );
    }
  }
  if (entries.length > ceiling) {
    errors.push(
      `${label.name} has ${entries.length} entries but its ceiling is ${ceiling}; the list only shrinks. ${fix}`
    );
  } else if (entries.length < ceiling) {
    errors.push(
      `${label.name} shrank to ${entries.length}; lower its ceiling from ${ceiling} to ${entries.length}`
    );
  }
}

/**
 * @param {Array<{path: string, source: string}>} [files]
 * @param {{
 *   readScript?: (path: string) => string | null,
 *   cronAllowlist?: readonly string[],
 *   cronCeiling?: number,
 *   admissionDebt?: Readonly<Record<string, {reason: string, replacement: string}>>,
 *   admissionCeiling?: number,
 *   pollingDebt?: Readonly<Record<string, string>>,
 *   pollingCeiling?: number,
 * }} [options]
 */
export function checkEventDrivenContract(
  files = [],
  {
    readScript = () => null,
    cronAllowlist = CRON_ALLOWLIST,
    cronCeiling = CRON_ALLOWLIST_CEILING,
    admissionDebt = ADMISSION_CRON_DEBT,
    admissionCeiling = ADMISSION_CRON_DEBT_CEILING,
    pollingDebt = POLLING_DEBT,
    pollingCeiling = POLLING_DEBT_CEILING,
  } = {}
) {
  const errors = [];
  const scheduled = new Set(
    files.filter(file => hasCronSchedule(file.source)).map(file => file.path)
  );
  ratchet(
    errors,
    {
      name: 'CRON_ALLOWLIST',
      added: () =>
        'new cron schedule; GitHub cron is frozen to measurement/scans on CRON_ALLOWLIST',
      stale: 'no longer has a cron schedule',
    },
    cronAllowlist,
    scheduled,
    cronCeiling,
    EVENT_DRIVEN_FIX
  );

  const admission = new Map();
  for (const file of files) {
    if (!scheduled.has(file.path)) continue;
    const signals = admissionSignals(file.source, readScript);
    if (signals.length) admission.set(file.path, signals);
  }
  for (const [path, entry] of Object.entries(admissionDebt)) {
    if (!entry?.reason || !entry?.replacement) {
      errors.push(
        `${path}: ADMISSION_CRON_DEBT entry needs a reason and a replacement`
      );
    }
  }
  ratchet(
    errors,
    {
      name: 'ADMISSION_CRON_DEBT',
      added: path =>
        `admission/landing workflow (${admission.get(path).join(', ')}) must never run from a schedule`,
      stale: 'is no longer a scheduled admission/landing workflow',
    },
    Object.keys(admissionDebt),
    new Set(admission.keys()),
    admissionCeiling,
    EVENT_DRIVEN_FIX
  );

  const polling = inventoryPolling(files);
  const pollingByKey = new Map(polling.map(row => [row.key, row.findings]));
  ratchet(
    errors,
    {
      name: 'POLLING_DEBT',
      added: key =>
        `holds a runner polling GitHub, git, or queue state (${pollingByKey.get(key).join('; ')}); a bounded retry of one transient call (at most 5 attempts) is fine, open-ended waiting is not`,
      stale: 'no longer polls',
    },
    Object.keys(pollingDebt),
    new Set(polling.map(row => row.key)),
    pollingCeiling,
    'react to the completion event instead (workflow_run, check_suite, merge_group, deployment_status) or extend the Gem lanes tick; never hold a runner waiting. See canon invariant ' +
      EVENT_DRIVEN_INVARIANT_ID
  );
  return { errors, scheduled: [...scheduled].sort(), admission, polling };
}

export function repoScriptReader(repoRoot) {
  return path => {
    const full = join(repoRoot, path);
    return existsSync(full) ? readFileSync(full, 'utf8') : null;
  };
}
