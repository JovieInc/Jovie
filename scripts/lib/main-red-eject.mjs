// Main-red ejection: pure policy for "a failing check must never stop the queue".
//
// Incident 2026-10-29 (#23600): a PR whose own merge group was RED landed on main
// because HEADGREEN lands every entry ahead of a green head, and the head (#23677,
// docs-only) path-selected away the structural lane. Every later group then failed on
// main's census row, not on its own change. These functions attribute the culprit
// commit, decide whether an automatic revert is allowed, account for queue-position
// pitfalls.
// No network or git here: scripts/main-red-eject.mjs feeds evidence in.
//
// Incident 2026-11-10 (JOV-8737): a test expired by the clock on an unchanged main and
// failed every merge group from 20:11Z to 04:13Z. No commit made it red, so there was
// nothing to revert, and plan() returned `none` (no shared signature was readable, job
// 130279777690) or an alert nobody acted on. detectUnattributedRed and remediationIntake
// turn "red with no culprit" into a remediation intake a fix lane picks up.

import { createHash } from 'node:crypto';
import { parseCiFastLog } from './merge-group-ahead-attribution.mjs';

export const INCIDENT_SCHEMA = 'jovie-main-red-incident/v1';
export const COMPOUNDING_LABEL = 'compounding';
export const REVERT_LABEL = 'main-red-revert';
export const REOPEN_LABEL = 'main-red-reopen';
export const FIX_RED_LABEL = 'lane-fix-red';
export const CONFLICT_LABEL = 'lane-fix-conflict';
export const INCIDENT_LABEL = 'main-health-incident';
export const MIN_CONSECUTIVE_GROUPS = 2;
export const MAX_LOOKBACK_COMMITS = 30;
export const MAX_ATTEMPTS_PER_CHANGE = 2;
export const UNMERGEABLE_DWELL_MIN = 5;

const ABORTED = new Set(['cancelled', 'skipped', 'neutral', 'stale']);
const RED = new Set(['failure', 'timed_out', 'startup_failure']);
// Gates every structural failure reports; they never identify a culprit.
const GENERIC_GATES = new Set([
  'Structural Contract',
  'Design governance enforcement',
]);

export const parsePrNumber = subject =>
  Number(/\(#(\d+)\)\s*$/.exec(String(subject ?? '').split('\n')[0])?.[1]) ||
  null;

/** A revert (ours or a human's) is never reverted again. */
export const isRevertSubject = subject =>
  /^revert(\(|:|\s|")/i.test(String(subject ?? '').trim());

/**
 * Signature of a failed run from its failed-job logs: failing test files and
 * named gates. Comparable across groups, unlike the 100-char truncated command.
 * @param {string[]} logs
 */
export function failureSignature(logs) {
  const tokens = new Set();
  for (const raw of logs) {
    const text = String(raw ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    for (const m of text.matchAll(
      /\bFAIL\s+\S+\s+([\w@./()[\]-]+\.test\.\w+)/g
    ))
      tokens.add(`test:${m[1]}`);
    for (const m of text.matchAll(
      /##\[error\]([A-Z][\w ()/.-]{2,60}?) failed\./g
    ))
      tokens.add(`gate:${m[1].trim()}`);
    for (const label of parseCiFastLog(text).failedCommands) {
      const file = /lib\/__tests__\/([\w.-]+\.test\.\w+)/.exec(label)?.[1];
      if (file) tokens.add(`test:lib/__tests__/${file}`);
    }
  }
  return [...tokens].sort();
}

const specific = signature =>
  signature.filter(
    t =>
      t.startsWith('test:') ||
      (t.startsWith('gate:') && !GENERIC_GATES.has(t.slice(5)))
  );

export function sameFailure(a, b) {
  const left = new Set(specific(a ?? []));
  return specific(b ?? []).some(token => left.has(token));
}

/** The check key a revert cap is scoped to: the most specific shared token. */
export const checkKey = signature =>
  specific(signature).find(t => t.startsWith('test:')) ??
  specific(signature)[0] ??
  null;

/**
 * Trigger: the same failure across >= n consecutive completed merge groups.
 * @param {Array<{id:number, conclusion:string, signature?:string[]}>} groups newest first
 */
export function detectConsecutiveGroupFailure(
  groups,
  n = MIN_CONSECUTIVE_GROUPS
) {
  const real = groups.filter(g => !ABORTED.has(g.conclusion));
  for (let i = 0; i + n <= real.length; i += 1) {
    const window = real.slice(i, i + n);
    if (!window.every(g => RED.has(g.conclusion) && g.signature?.length))
      continue;
    const shared = window[0].signature.filter(t =>
      window.every(g => g.signature.includes(t))
    );
    if (specific(shared).length) {
      return {
        triggered: true,
        signature: shared,
        groups: window.map(g => g.id),
      };
    }
  }
  return { triggered: false, signature: [], groups: [] };
}

/** Label and marker of scripts/lanes/remediation.py intake issues (INTAKE_LABEL, intake_body). */
export const INTAKE_LABEL = 'symphony-remediation';
export const INTAKE_SOURCE = 'merge-group-shared';
export const UNATTRIBUTED_MIN_GROUPS = 3;

/** PR a merge-group run was built for, from its `gh-readonly-queue/main/pr-<n>-<sha>` branch. */
export const groupPr = branch =>
  Number(
    /^gh-readonly-queue\/main\/pr-(\d+)-/.exec(String(branch ?? ''))?.[1]
  ) || null;

/**
 * Red with no readable shared signature: the newest n decided merge groups all
 * failed, each for a different PR, and none named a test or a specific gate.
 * One PR failing its own groups, or n PRs each failing a readable test of
 * their own, is theirs (the queue breaker holds them); otherwise it is main's.
 * @param {Array<{id:number, conclusion:string, branch?:string, signature?:string[]}>} groups newest first
 */
export function detectUnattributedRed(groups, n = UNATTRIBUTED_MIN_GROUPS) {
  const real = groups.filter(g => !ABORTED.has(g.conclusion));
  const green = real.findIndex(g => !RED.has(g.conclusion));
  const streak = green < 0 ? real : real.slice(0, green);
  const head = streak.slice(0, n);
  const prsOf = rows =>
    new Set(rows.map(g => groupPr(g.branch)).filter(Boolean));
  const prs = [...prsOf(streak)];
  return {
    triggered:
      prsOf(head).size >= n &&
      head.every(g => !specific(g.signature ?? []).length),
    groups: streak.map(g => g.id),
    prs,
  };
}

/**
 * Remediation intake for a red main that cannot be reverted. Same issue shape
 * as scripts/lanes/remediation.py intake_body: pr_events.convert_intake reads
 * the hex fingerprint from the marker and routes it to a fix lane after the
 * claim window (class fixable-by-model, next action route).
 * @param {{repo:string, check?:string|null, reason:string, groups:number[], prs?:number[], day:string}} input
 */
export function remediationIntake({
  repo,
  check = null,
  reason,
  groups,
  prs = [],
  day,
}) {
  // One intake per failing check; without a check, one per UTC day.
  const fingerprint = createHash('sha256')
    .update(check ? `main-red:${check}` : `main-red:unattributed:${day}`)
    .digest('hex')
    .slice(0, 20);
  const what = check
    ? `\`${check}\` fails merge groups but no main commit made it red (${reason})`
    : `the last ${groups.length} merge groups all failed on different PRs with no shared readable signature (${reason})`;
  const excerpt = [
    `Main is red and there is nothing to revert: ${what}.${prs.length ? ` Victim PRs: ${prs.map(n => `#${n}`).join(', ')}.` : ''}`,
    'Usual causes: a test or fixture with an expired date, a checked-in baseline two green PRs broke together, a tool download or environment break.',
    'Fix it on main in one small PR: reproduce on origin/main (run the failing job command from the evidence run), fix the cause, and do not dequeue or edit the victim PRs. If origin/main is green on that command, close this as not-main and leave the PRs to their own lanes.',
    'Never skip, weaken or quarantine the check to get green.',
  ].join('\n');
  const url = `https://github.com/${repo}/actions/runs/${groups[0]}`;
  const subject = JSON.stringify({ check, groups: groups.slice(0, 6), prs });
  return {
    fingerprint,
    title: `Symphony remediation ${INTAKE_SOURCE} ${fingerprint}`.slice(0, 80),
    body: [
      `Symphony remediation intake (${INTAKE_SOURCE}).`,
      `Fingerprint: \`${fingerprint}\``,
      'Workstream: `ws:ci`',
      `Subject: \`${subject}\``,
      `Evidence: ${url}`,
      excerpt.slice(0, 1500),
      `<!-- ${INTAKE_LABEL} fingerprint=${fingerprint} -->`,
    ].join('\n'),
  };
}

/** Evidence of a main commit for a signature, from that commit's own merge group. */
export function classifyEvidence(run, signature) {
  if (!run) return 'unknown';
  if (run.conclusion === 'success') return 'green';
  if (RED.has(run.conclusion))
    return sameFailure(run.signature ?? [], signature) ? 'red' : 'other';
  return 'unknown';
}

/**
 * First main commit whose own group went red on this failure. A later green
 * (docs-only head that skipped the lane) proves nothing, so scan oldest first.
 * @template {{sha:string, evidence:'red'|'green'|'other'|'unknown'}} T
 * @param {T[]} commits oldest first; attribution preserves the caller's metadata
 */
export function attributeCulprit(commits) {
  const firstRed = commits.findIndex(c => c.evidence === 'red');
  if (firstRed < 0) return { status: 'none', culprit: null, candidates: [] };
  const below = commits.slice(0, firstRed);
  const lastKnown = below.map(c => c.evidence).lastIndexOf('green');
  const gap = below.slice(lastKnown + 1); // commits with no proof either way
  if (gap.length === 0)
    return { status: 'attributed', culprit: commits[firstRed], candidates: [] };
  return {
    status: 'ambiguous',
    culprit: commits[firstRed],
    candidates: [...gap, commits[firstRed]],
  };
}

/**
 * Binary search for the first red commit among ordered candidates.
 * probe(sha) -> 'red' | 'green'. Assumes red stays red once introduced.
 */
export async function bisectFirstRed(candidates, probe) {
  let lo = 0;
  let hi = candidates.length - 1; // last candidate is known red
  const probes = [];
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const verdict = await probe(candidates[mid].sha);
    probes.push({ sha: candidates[mid].sha, verdict });
    if (verdict === 'red') hi = mid;
    else lo = mid + 1;
  }
  return { culprit: candidates[lo], probes };
}

/**
 * May the culprit be reverted automatically? One revert in flight per check and
 * per culprit, never a revert, bounded attempts per change. Revert first
 * (canon/MERGE_QUEUE_STEWARD.md): an open forward fix does not hold the revert
 * back; it replaces the revert only by landing first.
 */
export function decideEject({
  culprit,
  check,
  openReverts = [],
  priorAttempts = 0,
  culpritLabels = [],
  mode = 'apply',
  ambiguous = false,
}) {
  const no = (action, reason) => ({ action, reason });
  if (mode === 'off') return no('skip', 'kill-switch-off');
  if (!culprit) return no('alert', 'no-culprit');
  // An unproven predecessor (fail-fast hid this gate) means the first red may be a victim.
  if (ambiguous) return no('alert', 'ambiguous-culprit-needs-bisect');
  if (isRevertSubject(culprit.subject) || culpritLabels.includes(REVERT_LABEL))
    return no('alert', 'culprit-is-a-revert');
  if (openReverts.some(pr => pr.check === check))
    return no('skip', 'revert-in-flight-for-check');
  // Main Health's opener (scripts/main_health_revert.py) may already revert this commit.
  if (openReverts.some(pr => pr.culprit === culprit.sha))
    return no('skip', 'revert-in-flight-for-culprit');
  if (priorAttempts >= MAX_ATTEMPTS_PER_CHANGE)
    return no('alert', 'attempt-cap');
  if (!culprit.pr) return no('alert', 'culprit-has-no-pr');
  return no(mode === 'dry' ? 'dry-revert' : 'revert', 'culprit-attributed');
}

/** Conventional-commit title (<=100 chars) for the revert and re-land PRs. */
export function titles(culprit) {
  const base = String(culprit.subject)
    .replace(/\s*\(#\d+\)\s*$/, '')
    .replace(/^\w+(\([^)]*\))?!?:\s*/, '');
  const fit = (prefix, suffix) =>
    `${prefix}${base.slice(0, Math.max(10, 100 - prefix.length - suffix.length))}${suffix}`;
  return {
    revert: fit('revert(main-red): ', ` (#${culprit.pr})`),
    reopen: fit('fix(main-red): re-land ', ` (#${culprit.pr})`),
  };
}

export const marker = fields =>
  `<!-- main-red-eject ${JSON.stringify(fields)} -->`;
export const readMarker = body => {
  const m = /<!-- main-red-eject (\{.*?\}) -->/.exec(String(body ?? ''));
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
};

/** Key families where a newer alert replaces the older open ones. */
export const SUPERSEDING_FAMILIES = ['queue-head-stuck:'];

/**
 * Open incidents an alert replaces: same key family, other key. A
 * queue-head-stuck alert is about one head; once another head is the one stuck,
 * the older alerts are stale (Tim, 2026-11-09: close them all, "dont ask
 * again"). Without this they piled up past the 50-issue read and the alert
 * stopped finding its own open issue, so it filed duplicates.
 */
export function supersededIncidents(
  found,
  key,
  families = SUPERSEDING_FAMILIES
) {
  const family = families.find(f => key.startsWith(f));
  if (!family) return [];
  return found.filter(i => {
    const k = readMarker(i.body)?.key;
    return typeof k === 'string' && k.startsWith(family) && k !== key;
  });
}

/**
 * Read the open incidents, close the ones `key` supersedes and return the rest.
 * A failed close only warns: housekeeping must not block the new alert.
 */
export async function openIncidents({ api, gh, repo, key }) {
  const found = await api(
    `repos/${repo}/issues?state=open&labels=${INCIDENT_LABEL}&per_page=100`,
    'repair'
  );
  const stale = supersededIncidents(found, key);
  for (const { number } of stale) {
    await gh([
      'api',
      '-X',
      'PATCH',
      `repos/${repo}/issues/${number}`,
      '-f',
      'state=closed',
      '-f',
      'state_reason=completed',
    ]).catch(error =>
      console.error(`::warning::stale incident close failed: ${error.message}`)
    );
  }
  return found.filter(i => !stale.includes(i));
}

// ---- queue pitfalls ---------------------------------------------------------

/**
 * `jump:true` on a PR that is already queued is a no-op, and the position the
 * enqueue call reports is stale (it is read before the jump reorders the queue).
 * So: dequeue first, enqueue through Green Enroll, then re-read the queue.
 * @param {Array<{number:number, position:number, state:string}>} entries
 */
export function planJump(entries, prNumber) {
  const entry = entries.find(e => e.number === prNumber);
  if (!entry) return { step: 'enqueue-with-jump' };
  if (entry.position === 1) return { step: 'already-head', position: 1 };
  return { step: 'dequeue-then-enqueue-with-jump', staleAt: entry.position };
}

/** Verified outcome from a fresh queue read taken after the enqueue. */
export function verifyJump(freshEntries, prNumber, reportedPosition = null) {
  const entry = freshEntries.find(e => e.number === prNumber);
  if (!entry) return { queued: false, jumped: false, reportedPosition };
  const compounding = freshEntries.filter(e => e.compounding);
  return {
    queued: true,
    position: entry.position,
    // Behind other compounding entries is still a valid jump.
    jumped: entry.position <= Math.max(1, compounding.length),
    reportedPosition,
    reportedStale:
      reportedPosition != null && reportedPosition !== entry.position,
  };
}

/**
 * Head entry UNMERGEABLE longer than the dwell is a group conflict GitHub never
 * ejects (#23692: 18:33Z to 19:30Z, PR itself MERGEABLE/CLEAN).
 * @param {Array<{number:number, position:number, state:string}>} entries
 * @param {Record<string,string>} firstSeen PR number -> ISO first UNMERGEABLE sighting
 */
export function detectStuckHead(
  entries,
  firstSeen,
  now = Date.now(),
  dwellMin = UNMERGEABLE_DWELL_MIN
) {
  const head = entries.find(e => e.position === 1);
  if (!head || head.state !== 'UNMERGEABLE')
    return { stuck: false, observe: null, head: head?.number ?? null };
  const seen = firstSeen[String(head.number)];
  if (!seen) return { stuck: false, observe: head.number, head: head.number };
  const dwell = (now - Date.parse(seen)) / 60_000;
  return {
    stuck: dwell > dwellMin,
    dwellMin: Math.round(dwell * 10) / 10,
    head: head.number,
    since: seen,
  };
}

/** A queue head at position 1 longer than this is paged as an incident. */
export const HEAD_STUCK_ALERT_MIN = 45;

/**
 * Stage metric for the merge queue head: minutes since it was enqueued (an upper
 * bound on its time at position 1). Keyed by PR number for p50/p95 tracking.
 * @param {Array<{number:number, position:number, state:string, enqueuedAt?:string}>} entries
 */
export function headDwell(entries, now = Date.now()) {
  const head = entries.find(e => e.position === 1);
  if (!head) return { stage: 'queue-head', head: null, stuckMin: 0 };
  const at = Date.parse(head.enqueuedAt ?? '');
  return {
    stage: 'queue-head',
    head: head.number,
    state: head.state,
    stuckMin: Number.isFinite(at)
      ? Math.max(0, Math.round((now - at) / 6000) / 10)
      : 0,
  };
}

/**
 * Whether a failed gh call should retry on the job's own GITHUB_TOKEN: the app
 * installation budget is exhausted (deferred exit 75 or GitHub's rate-limit text).
 * @param {{code:number, stderr?:string, deferred?:boolean}} result
 * @param {string|undefined} fallbackToken
 */
export function shouldFailOver(result, fallbackToken) {
  if (!fallbackToken || result.code === 0) return false;
  return (
    result.deferred === true ||
    result.code === 75 ||
    /rate limit (already )?exceeded/i.test(result.stderr ?? '')
  );
}

/** Required merge-group contexts (CI / PR Ready aggregates ci-fast, so a red ci-fast guarantees it). */
export const REQUIRED_CHECK_NAMES = Object.freeze([
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
  'Company guards',
]);
export const REQUIRED_CHECK_PREFIXES = Object.freeze(['ci-fast (']);

const isRequiredCheck = name => {
  const bare = String(name).replace(/^CI \/ /, '');
  return (
    REQUIRED_CHECK_NAMES.includes(bare) ||
    REQUIRED_CHECK_PREFIXES.some(p => bare.startsWith(p))
  );
};

/**
 * Required checks whose latest run on the merge-group head concluded FAILURE.
 * @param {Array<{id:number, name:string, conclusion:string|null}>} checkRuns
 * @returns {string[]} sorted names
 */
export function failingRequiredChecks(checkRuns = []) {
  const latest = new Map();
  for (const c of checkRuns) {
    const prev = latest.get(c.name);
    if (!prev || c.id > prev.id) latest.set(c.name, c);
  }
  return [...latest.values()]
    .filter(c => c.conclusion === 'failure' && isRequiredCheck(c.name))
    .map(c => c.name)
    .sort();
}

/**
 * A queue head with a failed required check blocks everyone behind it even
 * though GitHub never ejects it (#23966: 5 h). Dequeue only when main is green,
 * so a red main stays the revert path's business. Never re-enqueues, never jumps.
 * @param {{head?: {number:number, position:number, state:string, sha?:string|null}|null, failing: string[], mainGreen: boolean}} input
 */
export function decideFailingHead({ head, failing, mainGreen }) {
  const no = reason => ({ dequeue: false, reason });
  if (!head || head.position !== 1) return no('no-head');
  if (!failing.length) return no('no-failed-required-check');
  if (!mainGreen) return no('main-not-green');
  return { dequeue: true, reason: 'required-check-failed', failing };
}

export const failingHeadComment = (head, failing) =>
  `${marker({ failingHeadDequeued: head.sha ?? null })}\nRemoved from the merge queue: required check${failing.length === 1 ? '' : 's'} failed on the merge group (${failing.map(n => `\`${n}\``).join(', ')}) while main CI is green. Fix and push; Merge Queue Green Enroll re-admits it when checks pass.`;
