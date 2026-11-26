/**
 * Hermetic ordinary-issue validation-closure replay harness (Gate 7–8 /
 * INV-TERMINAL-RECEIPT-1). Fake clock + in-memory Linear/Ovie only — no
 * network, secrets, or production mutations. Cross-ref Summer vector
 * https://github.com/JovieInc/summer-config/pull/531
 */

import { createHash } from 'node:crypto';
import {
  decideOutcomeResidual,
  mayEmitOutcomePassReceipt,
} from '../../outcome-residual-policy.mjs';
import {
  decideValidationTransition,
  deriveValidationManifest,
  formatLifecycleComment,
  lifecycleStatusKey,
} from '../../validation-lifecycle.mjs';

/** Identifiers aligned with summer.ordinary-issue-shipping-replay/v1. */
export const ORDINARY_ISSUE_CLOSURE_VECTOR = Object.freeze({
  schema: 'jovie.ordinary-issue-validation-closure-replay/v1',
  policy: Object.freeze({
    targetRepo: 'JovieInc/Jovie',
    acceptanceEpisode: '2026-11-20T00:00:00.000Z',
    signalFingerprint: 'sentry:issue:9900001',
    workKeyDomain: 'summer.ordinary-work-key/v1',
  }),
  clock: Object.freeze({
    T8: '2026-11-20T01:05:00.000Z',
    T9: '2026-11-20T01:10:00.000Z',
    T10: '2026-11-20T01:10:05.000Z',
  }),
  identifiers: Object.freeze({
    issue: 'JOV-99001',
    prNumber: 90001,
    M1: 'aa11111111111111111111111111111111111111',
    P1: 'bb11111111111111111111111111111111111111',
    // Precomputed sha256 of canonicalJson({ domain, targetRepo, anchor, acceptanceEpisode })
    // matching summer-config ordinary-issue-shipping-replay-v1 expectedWorkKey.
    expectedWorkKey:
      '03ab1c2ea094337b0da84cf5c2998b2e11d9bad069a677e9cadf2a12cbf31ac9',
  }),
  defect: Object.freeze({
    title: 'Malformed /r/[slug] legacy smart-link returns 500 instead of 404',
    description: [
      '## Acceptance',
      '- [ ] GET /r/y returns 404 (not 500) on production',
      '- [ ] Valid legacy /r/<slug>--<uuid> still 308 redirects',
      '- [ ] Sentry issue 9900001 has zero events in the 24h post-deploy window',
      '',
      'validation-required: outcome',
      'Signal fingerprint `sentry:issue:9900001`',
    ].join('\n'),
  }),
  markers: Object.freeze({
    validationLifecycle: 'validation-lifecycle:v1',
  }),
});

/**
 * Sorted-key canonical JSON matching summer-config `canonicalJson` (no
 * whitespace; keys sorted at every level) so workKey bytes match PR #531.
 *
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Deterministic workKey (Summer INV-WORK-KEY-1 shape).
 *
 * @param {typeof ORDINARY_ISSUE_CLOSURE_VECTOR} [vector]
 * @param {string} [anchor]
 * @returns {string}
 */
export function deriveOrdinaryWorkKey(
  vector = ORDINARY_ISSUE_CLOSURE_VECTOR,
  anchor = vector.policy.signalFingerprint
) {
  return createHash('sha256')
    .update(
      canonicalJson({
        domain: vector.policy.workKeyDomain,
        targetRepo: vector.policy.targetRepo,
        anchor,
        acceptanceEpisode: vector.policy.acceptanceEpisode,
      })
    )
    .digest('hex');
}

function createManualClock(iso) {
  let now = Date.parse(iso);
  return {
    now: () => new Date(now),
    iso: () => new Date(now).toISOString(),
    advanceTo(next) {
      const t = Date.parse(next);
      if (!(t >= now)) throw new Error(`clock-regression:${next}`);
      now = t;
    },
  };
}

/**
 * @param {typeof ORDINARY_ISSUE_CLOSURE_VECTOR} [vector]
 */
export function createOrdinaryIssueValidationClosureHarness(
  vector = ORDINARY_ISSUE_CLOSURE_VECTOR
) {
  const clock = createManualClock(vector.clock.T8);
  const workKey = vector.identifiers.expectedWorkKey;
  /** @type {Map<string, { identifier: string, state: string, type: string, comments: { body: string, movesToDone?: boolean, marker?: string }[], transitions: { from: string, to: string, at: string }[] }>} */
  const issues = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const ovieItems = new Map();
  /** @type {import('../../validation-lifecycle.mjs').ResolvedReceipt[]} */
  let receipts = [];
  let terminalSealed = false;

  const id = vector.identifiers;

  const seedIssue = () => {
    issues.set(id.issue, {
      identifier: id.issue,
      state: 'Merging',
      type: 'started',
      comments: [],
      transitions: [],
    });
  };

  const setState = (to, type = 'started') => {
    const issue = issues.get(id.issue);
    if (!issue) throw new Error('missing-issue');
    if (issue.state === to) return;
    issue.transitions.push({ from: issue.state, to, at: clock.iso() });
    issue.state = to;
    issue.type = type;
  };

  const manifest = () => {
    const built = deriveValidationManifest({
      issue: {
        identifier: id.issue,
        title: vector.defect.title,
        description: vector.defect.description,
        labels: [],
      },
      mergedPulls: [
        {
          number: id.prNumber,
          url: `https://github.com/JovieInc/Jovie/pull/${id.prNumber}`,
          mergeSha: id.M1,
          mergedAt: '2026-11-20T00:48:00.000Z',
        },
      ],
      risk: {
        riskLevel: 'low',
        blocksUnattendedAutoMerge: false,
        matchedRules: [],
      },
    });
    if (!built) throw new Error('expected-manifest');
    return built;
  };

  const deployment = () => ({
    status: /** @type {const} */ ('verified'),
    sha: id.P1,
    containsBinding: true,
    previousVerifiedEntry: true,
  });

  const state = () => {
    const issue = issues.get(id.issue);
    if (!issue) throw new Error('missing-issue');
    return { name: issue.state, type: issue.type };
  };

  /**
   * Stage 5a/5b: deploy + independent verification with residual policy.
   * Unverifiable mandatory items must hold Validating (INV-TERMINAL-RECEIPT-1).
   */
  /**
   * @param {readonly unknown[]} items
   */
  function productionAndVerifyWithResidual(items) {
    if (!issues.has(id.issue)) seedIssue();
    clock.advanceTo(vector.clock.T8);
    setState('Validating');

    const residualDecision = decideOutcomeResidual(items);
    const m = manifest();

    // 5a path: residual hold — no outcome pass receipt; completionHolds block Done.
    if (!mayEmitOutcomePassReceipt(residualDecision)) {
      const held = decideValidationTransition({
        state: state(),
        manifest: m,
        holds: [],
        completionHolds: residualDecision.completionHolds,
        deployment: deployment(),
        receipts: [],
      });
      return {
        residualDecision,
        transition: held,
        linearState: issues.get(id.issue).state,
        afterUnverifiable: issues.get(id.issue).state,
      };
    }

    clock.advanceTo(vector.clock.T9);
    receipts = [
      {
        kind: 'outcome',
        status: 'pass',
        sha: id.P1,
        evidence: `HTTP probe /r/y 500→404 and authenticated Sentry 24h zero-event on ${id.P1}`,
        recordedAt: clock.iso(),
        containsBinding: true,
        verifiedArtifact: true,
      },
    ];
    const cleared = decideValidationTransition({
      state: state(),
      manifest: m,
      holds: [],
      completionHolds: [],
      deployment: deployment(),
      receipts,
    });
    return {
      residualDecision,
      transition: cleared,
      linearState: issues.get(id.issue).state,
      afterUnverifiable: null,
    };
  }

  /**
   * Stage 6: apply a cleared transition once, project workKey-bound Ovie item.
   * Duplicate delivery is idempotent.
   */
  function sealTerminalFromTransition(transition) {
    if (clock.iso() < vector.clock.T10) clock.advanceTo(vector.clock.T10);
    const issue = issues.get(id.issue);
    if (!issue) throw new Error('missing-issue');
    const m = manifest();

    if (transition.target !== 'Done') {
      throw new Error(`not-done:${transition.target}`);
    }

    const statusKey = lifecycleStatusKey({
      target: transition.target,
      manifest: m,
      missing: transition.missing,
      failing: transition.failing,
      deploymentSha: id.P1,
    });
    const body = formatLifecycleComment({
      identifier: id.issue,
      from: issue.state,
      target: transition.target,
      manifest: m,
      missing: transition.missing,
      explanation: transition.explanation,
      statusKey,
      deploymentSha: id.P1,
    });

    if (!terminalSealed) {
      setState('Done', 'completed');
      issue.comments.push({
        body,
        movesToDone: true,
        marker: vector.markers.validationLifecycle,
      });
      ovieItems.set(workKey, {
        issue: id.issue,
        stage: 'verified',
        workKey,
        prNumber: id.prNumber,
        mergeSha: id.M1,
        prodSha: id.P1,
      });
      terminalSealed = true;
    } else {
      // Duplicate receipt delivery: rewrite Blob/Ovie idempotently, no second Done move.
      ovieItems.set(workKey, {
        issue: id.issue,
        stage: 'verified',
        workKey,
        prNumber: id.prNumber,
        mergeSha: id.M1,
        prodSha: id.P1,
      });
    }

    return {
      statusKey,
      comment: body,
      ovie: ovieItems.get(workKey),
    };
  }

  return {
    vector,
    clock,
    workKey,
    deriveWorkKey: anchor => deriveOrdinaryWorkKey(vector, anchor),
    seedIssue,
    manifest,
    decideOutcomeResidual,
    mayEmitOutcomePassReceipt,
    productionAndVerifyWithResidual,
    sealTerminalFromTransition,
    linear: {
      getIssue: issueId =>
        issues.has(issueId) ? structuredClone(issues.get(issueId)) : null,
      stateTransitions: issueId =>
        structuredClone(issues.get(issueId)?.transitions ?? []),
      commentsWithMarker: (issueId, marker) =>
        (issues.get(issueId)?.comments ?? []).filter(
          c => c.body.includes(marker) || c.marker === marker
        ),
    },
    ovie: {
      getShippingItemByWorkKey: key =>
        ovieItems.has(key) ? structuredClone(ovieItems.get(key)) : null,
    },
    decideValidationTransition,
  };
}
