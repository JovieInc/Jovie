/**
 * Golden Path release hold (slice 2 of the certification work).
 *
 * Certifications are tied to the release, not a clock. A release is held only
 * when it touches a step whose certification for that release is failing or
 * missing. A step the release does not touch never holds it, whatever its
 * state. A held release opens or updates one Linear fix issue per step
 * (`release-hold:<step>`), and the hold and the issues are always reported.
 * Shipping never halts: the next release that fixes the step promotes.
 *
 * Fails closed: unknown scope touches every step, and unreadable scope or
 * certifications read as every step touched and none certified.
 */
import { SURFACE_IDS } from './prod-cert.mjs';

export const HOLD_SCHEMA = 'jovie.golden-path-release-hold/v1';
const SHA = /^[0-9a-f]{40}$/u;

export const holdFingerprint = (/** @type {string} */ step) =>
  `release-hold:${step}`;

/**
 * @param {{
 *   candidateSha: string,
 *   touched: { all?: boolean, steps?: readonly string[], reason?: string | null } | null | undefined,
 *   certifications: Record<string, { status?: string, sha?: string, runUrl?: string | null } | undefined> | null | undefined,
 * }} input
 */
export function decideReleaseHold({ candidateSha, touched, certifications }) {
  const scopeKnown = Boolean(touched) && Array.isArray(touched?.steps);
  const touchesAll = !scopeKnown || touched?.all === true;
  const steps = touchesAll
    ? [...SURFACE_IDS]
    : SURFACE_IDS.filter(id => touched?.steps?.includes(id));
  const scopeReason = !scopeKnown
    ? 'step scope unavailable'
    : (touched?.reason ?? null);
  const certsKnown =
    Boolean(certifications) && typeof certifications === 'object';
  const held = [];
  for (const step of steps) {
    const cert = certsKnown ? certifications?.[step] : undefined;
    if (!SHA.test(String(candidateSha))) {
      held.push({ step, why: 'no exact candidate SHA', runUrl: null });
    } else if (!cert) {
      held.push({
        step,
        why: certsKnown
          ? 'no certification for this release'
          : 'certifications unavailable',
        runUrl: null,
      });
    } else if (cert.sha !== candidateSha) {
      held.push({
        step,
        why: `no certification for this release (latest is on ${String(cert.sha).slice(0, 8)})`,
        runUrl: cert.runUrl ?? null,
      });
    } else if (cert.status !== 'passed') {
      held.push({
        step,
        why: `certification ${cert.status ?? 'unknown'} on this release`,
        runUrl: cert.runUrl ?? null,
      });
    }
  }
  return {
    schema: HOLD_SCHEMA,
    candidateSha,
    decision: held.length > 0 ? 'hold' : 'promote',
    touched: steps,
    scopeReason,
    held,
  };
}

/**
 * Open or update the fix issue for every held step. Never throws: an issue
 * that cannot be opened is recorded and the hold stands.
 * @param {ReturnType<typeof decideReleaseHold>} decision
 * @param {{ upsert: (input: any) => Promise<any> }} deps
 */
export async function applyReleaseHold(decision, { upsert }) {
  const issues = [];
  for (const h of decision.held) {
    const fingerprint = holdFingerprint(h.step);
    const short = decision.candidateSha.slice(0, 8);
    try {
      const r = await upsert({
        fingerprint,
        title: `${fingerprint} Golden Path step ${h.step} blocks release ${short}`,
        description: [
          `Release \`${decision.candidateSha}\` touches the Golden Path step \`${h.step}\` and is held: ${h.why}.`,
          h.runUrl ? `Latest run: ${h.runUrl}` : null,
          decision.scopeReason ? `Scope: ${decision.scopeReason}` : null,
          'Only this release is held. Fix the step and the next release promotes.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        priority: 1,
        createStateName: 'Todo',
        reopenTerminal: true,
      });
      issues.push({
        step: h.step,
        fingerprint,
        ok: Boolean(r?.ok),
        action: r?.action ?? null,
        identifier: r?.identifier ?? null,
        reason: r?.ok ? null : (r?.reason ?? 'upsert failed'),
      });
    } catch (error) {
      issues.push({
        step: h.step,
        fingerprint,
        ok: false,
        action: null,
        identifier: null,
        reason: error instanceof Error ? error.message : 'upsert threw',
      });
    }
  }
  return { ...decision, issues };
}

/** @param {Awaited<ReturnType<typeof applyReleaseHold>>} result */
export function holdSummaryLines(result) {
  const short = result.candidateSha.slice(0, 8);
  if (result.decision === 'promote')
    return [
      `Golden Path release ${short}: PROMOTE. Touched steps (${result.touched.length}) are certified or none is failing.`,
    ];
  return [
    `Golden Path release ${short}: HELD by ${result.held.length} step(s). Only this release is held.`,
    ...result.held.map(h => {
      const i = result.issues?.find(x => x.step === h.step);
      const issue = !i
        ? 'issue not attempted'
        : i.ok
          ? `fix issue ${i.identifier ?? i.fingerprint} (${i.action ?? 'upserted'})`
          : `fix issue NOT opened (${i.reason})`;
      return `- ${h.step}: ${h.why}; ${issue}`;
    }),
  ];
}
