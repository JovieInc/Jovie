/**
 * Carried Golden Path receipts for scripts/prod-cert.mjs (JOV-14402).
 *
 * The carry plan (scripts/golden-path-cert-reuse.mjs decide) names the steps
 * this release re-certifies and the steps whose certification carries
 * forward from an earlier release. prod-cert runs checks only for the first
 * set and posts a carried receipt for each of the second: a passed receipt
 * bound to the served SHA, with one `carried-forward` check and a
 * `carriedFrom` block naming the run that actually exercised the step.
 *
 * A plan decided for another SHA carries nothing: if production now serves a
 * different build, each carried step gets a blocked receipt instead, and the
 * next run decides again. Kept out of prod-cert.mjs (size baseline).
 */
import { readFileSync } from 'node:fs';
import { parseCarryPlan } from './golden-path-cert-reuse.mjs';
import { buildReceipt, SURFACE_IDS } from './prod-cert.mjs';

/**
 * `--surfaces` value: space or comma separated step ids. Empty or absent
 * means every step. An unknown id is an error, never ignored.
 * @param {string | undefined} value
 * @returns {string[] | null}
 */
export function parseSurfaceList(value) {
  const ids = String(value ?? '')
    .split(/[\s,]+/u)
    .filter(Boolean);
  if (ids.length === 0) return null;
  const unknown = ids.filter(id => !SURFACE_IDS.includes(id));
  if (unknown.length)
    throw new Error(`unknown Golden Path step: ${unknown.join(', ')}`);
  return SURFACE_IDS.filter(id => ids.includes(id));
}

/**
 * Read `--carry FILE`. A missing, unreadable or malformed plan carries
 * nothing, so every step certifies.
 * @param {string | undefined} path
 */
export function loadCarryPlan(path) {
  if (!path) return null;
  try {
    return parseCarryPlan(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Which steps this run certifies: the plan's recertify list (narrowed by
 * `--surfaces` when given), or every requested step without a plan.
 * @param {ReturnType<typeof loadCarryPlan>} plan
 * @param {string[] | null} requested
 */
export function surfacesToCertify(plan, requested) {
  const wanted = requested ?? SURFACE_IDS;
  if (!plan) return [...wanted];
  const recertify = new Set(plan.recertify.map(r => r.surface));
  return wanted.filter(id => recertify.has(id));
}

/**
 * One receipt per carried step, bound to the build production serves now.
 * @param {ReturnType<typeof loadCarryPlan>} plan
 * @param {{ served: { sha: string, deploymentId?: string | null }, runUrl?: string | null, now?: () => string }} input
 */
export function carriedReceipts(
  plan,
  { served, runUrl = null, now = () => new Date().toISOString() }
) {
  if (!plan) return [];
  return plan.carried.map(({ surface, from }) => {
    const at = now();
    const matches = plan.servedSha === served.sha;
    const check = matches
      ? {
          id: 'carried-forward',
          status: 'passed',
          startedAt: at,
          endedAt: at,
          summary: `Certified on ${from.sha.slice(0, 8)} at ${from.endedAt} (${from.runUrl ?? 'run unknown'}); release ${served.sha.slice(0, 8)} touches none of this step's files, routes or deps.`,
        }
      : {
          id: 'carry-plan-matches-served',
          status: 'blocked',
          startedAt: at,
          endedAt: at,
          summary: `carry plan was decided for ${plan.servedSha.slice(0, 8)} but production serves ${served.sha.slice(0, 8)}; nothing carried, the next run decides again`,
        };
    const receipt = buildReceipt({
      surface,
      checks: [check],
      sha: served.sha,
      deploymentId: served.deploymentId ?? null,
      runUrl,
      startedAt: at,
      endedAt: at,
    });
    return matches ? { ...receipt, carriedFrom: from } : receipt;
  });
}

/**
 * Stand-ins for the steps the plan found already certified on the served SHA.
 * They are never posted or filed; they only let the run's verdict, split and
 * bottleneck see that those steps are green without running them again.
 * @param {ReturnType<typeof loadCarryPlan>} plan
 * @param {{ sha: string }} served
 */
export function currentStandIns(plan, served) {
  if (!plan || plan.servedSha !== served.sha) return [];
  return plan.current.map(surface => ({
    surface,
    status: 'passed',
    sha: served.sha,
    alreadyCertified: true,
    checks: [{ id: 'certified-on-served', status: 'passed' }],
  }));
}

/** Certified and carried receipts together, in launch order. */
export function inLaunchOrder(/** @type {any[]} */ receipts) {
  return [...receipts].sort(
    (a, b) => SURFACE_IDS.indexOf(a.surface) - SURFACE_IDS.indexOf(b.surface)
  );
}
