// Red main with nothing to revert: the part of the main-red ejector that pages and
// hands main to a fix lane instead of returning `none`.
//
// 2026-11-10 (JOV-8737): a test expired by the clock on an unchanged main and failed
// every merge group from 20:11Z to 04:13Z. No commit made it red, so the ejector had
// no culprit: plan() returned "failures-do-not-share-a-signature" (job 130279777690)
// or an alert nobody acted on, and every lane waited. The driver
// (scripts/main-red-eject.mjs) injects its own gh, api and incident helpers.
import {
  detectUnattributedRed,
  INTAKE_LABEL,
  remediationIntake,
} from './lib/main-red-eject.mjs';

/**
 * plan() result when the recent failures share no readable signature: `none`
 * for a few PRs' own failures, a remediate decision when the newest groups all
 * failed on different PRs.
 * @param {object} result plan header (schema, mode, at, trigger)
 * @param {Array<{id:number, conclusion:string, branch?:string}>} recent newest first
 * @param {string} mode
 */
export function unattributedPlan(result, recent, mode) {
  const unattributed = detectUnattributedRed(recent);
  const reason = 'failures-do-not-share-a-signature';
  if (!unattributed.triggered) return { ...result, action: 'none', reason };
  return {
    ...result,
    trigger: { groups: unattributed.groups, signature: [] },
    check: null,
    culprit: null,
    unattributed,
    decision: {
      action: mode === 'apply' ? 'remediate' : 'dry-remediate',
      reason,
    },
  };
}

/**
 * File the remediation intake. One open issue per fingerprint (same dedupe as
 * pr_events.upsert_intake); a filing failure is reported, never thrown: the
 * incident already paged.
 */
async function fileIntake(p, reason, { api, gh, repo }) {
  const intake = remediationIntake({
    repo,
    check: p.check ?? null,
    reason,
    groups: p.trigger?.groups ?? [],
    prs: p.unattributed?.prs ?? [],
    day: String(p.at ?? new Date().toISOString()).slice(0, 10),
  });
  const { fingerprint } = intake;
  try {
    const open = await api(
      `repos/${repo}/issues?state=open&labels=${INTAKE_LABEL}&per_page=100`,
      'repair'
    );
    const existing = open.find(i =>
      String(i.body ?? '').includes(`fingerprint=${fingerprint} -->`)
    );
    if (existing)
      return { fingerprint, issue: existing.number, created: false };
    const created = JSON.parse(
      await gh([
        'api',
        '-X',
        'POST',
        `repos/${repo}/issues`,
        '-f',
        `title=${intake.title}`,
        '-f',
        `body=${intake.body}`,
        '-f',
        `labels[]=${INTAKE_LABEL}`,
      ])
    );
    return { fingerprint, issue: created.number, created: true };
  } catch (error) {
    console.error(`::warning::remediation intake failed: ${error.message}`);
    return { fingerprint, error: String(error.message).slice(0, 200) };
  }
}

/**
 * apply() for every decision that is not a revert. An alert pages as before;
 * "no-culprit" (no main commit made the check red, so a revert can never fix
 * it) and "remediate" also file the intake. Returns the fields to add to the
 * applied result.
 * @param {any} p plan
 * @param {{api: Function, gh: Function, incident: Function, repo: string}} io
 */
export async function remediateUnrevertable(p, io) {
  const { culprit, check, decision } = p;
  if (decision.action === 'remediate') {
    const groups = p.trigger.groups;
    const runs = groups
      .slice(0, 6)
      .map(id => `https://github.com/${io.repo}/actions/runs/${id}`);
    const issue = await io.incident(
      'unattributed-red',
      `main-red: last ${groups.length} merge groups failed on different PRs`,
      `The last ${groups.length} merge groups all failed (PRs ${p.unattributed.prs.map(n => `#${n}`).join(', ')}) with no shared readable signature, so no culprit can be reverted. Runs: ${runs.join(', ')}. A remediation intake routes the fix to a lane.`
    );
    return {
      incident: issue,
      intake: await fileIntake(p, decision.reason, io),
    };
  }
  if (decision.action !== 'alert') return {};
  await io.incident(
    `alert:${check}`,
    `main-red: ${check} (manual: ${decision.reason})`,
    `Main is red on \`${check}\`. Automatic revert not taken: ${decision.reason}. Culprit candidate: ${culprit ? `#${culprit.pr} ${culprit.sha}` : 'unknown'}.`
  );
  if (decision.reason !== 'no-culprit' || p.mode !== 'apply') return {};
  return { intake: await fileIntake(p, decision.reason, io) };
}
