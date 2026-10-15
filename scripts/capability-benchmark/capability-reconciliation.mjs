import { createHash } from 'node:crypto';

import { requireIsoTimestamp } from '../summer-commissioning/receipt-trust.mjs';
import { requiresOviCertification } from './capability-benchmark.mjs';

export const CAPABILITY_EVENT_SCHEMA = 'jovie.capability-event/v1';
export const RECONCILIATION_SCHEMA =
  'jovie.capability-backlog-reconciliation/v1';

export const CAPABILITY_EVENT_CLASSES = Object.freeze(
  'new-or-improved-capability managed-infrastructure connector-surface marketplace-or-distribution pricing-credit-or-quota reliability-latency-or-quality policy-terms-security-or-privacy protocol-or-platform deprecation internal-benchmark-or-runtime'.split(
    ' '
  )
);
export const RECONCILIATION_DISPOSITIONS = Object.freeze(
  'KEEP IMPROVE_INTERNAL ADOPT REPLACE HYBRID_SHADOW DEFER INVESTIGATE RETIRE'.split(
    ' '
  )
);
const SCORE_FACTORS = new Set(
  'futureExpectedValue futureExpectedCost switchingCost strategicDifferentiation control securityPrivacy reliability performance reversibility migrationRisk'.split(
    ' '
  )
);
const TERMINAL_STATE_TYPES = new Set(['completed', 'canceled']);
const MUTATION_KINDS = new Set(['cancel', 'rewrite', 'rerank']);
const MAX_LINEAR_READY_UPDATES = 20;
const SENSITIVE_OUTPUT =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:acct|ch|cs|cus|evt|in|ii|pi|pm|price|prod|req|rk|seti|si|sk|src|sub|tok|whsec)_[A-Za-z0-9_-]+\b|\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_-]+\b|\b[0-9]{12,19}\b)/iu;

function text(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty text`);
  }
  return value.trim();
}

function normalized(value) {
  return text(value, 'id')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-');
}

function boundedText(value, field, maxLength) {
  const result = text(value, field);
  if (result.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`);
  }
  return result;
}

function redactionSafeText(value, field, maxLength) {
  const result = boundedText(value, field, maxLength);
  if (SENSITIVE_OUTPUT.test(result)) {
    throw new Error(`${field} contains sensitive or reusable identifiers`);
  }
  return result;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function capabilityEventFromEvidence(evidence, change) {
  if (evidence?.schema !== 'jovie.canonical-evidence/v1') {
    throw new Error('event must reference JOV-5916 canonical evidence');
  }
  if (!CAPABILITY_EVENT_CLASSES.includes(change?.class)) {
    throw new Error('unknown capability event class');
  }
  if (
    !Array.isArray(change.capabilityIds) ||
    change.capabilityIds.length === 0
  ) {
    throw new Error('capabilityIds must be non-empty');
  }
  const provider = normalized(change.provider);
  const externalChangeId = normalized(change.externalChangeId);
  const id = `capability-event:${digest(`${provider}|${externalChangeId}`).slice(0, 24)}`;
  const event = {
    schema: CAPABILITY_EVENT_SCHEMA,
    id,
    evidenceId: text(evidence.stableIdentity ?? evidence.id, 'evidence id'),
    provider,
    externalChangeId,
    class: change.class,
    capabilityIds: [
      ...new Set(
        change.capabilityIds.map(value => text(value, 'capability id'))
      ),
    ].sort(),
    observedAt: text(evidence.provenance?.observedAt, 'observedAt'),
  };
  return {
    ...event,
    digest: digest({
      id,
      class: event.class,
      capabilityIds: event.capabilityIds,
    }),
  };
}

function commerceEvidenceSnapshot(value) {
  const hash = (input, field) => {
    if (!/^[a-f0-9]{64}$/u.test(input)) {
      throw new Error(`commerce evidence ${field} must be a SHA-256 digest`);
    }
    return input;
  };
  const timestamp = (input, field) =>
    requireIsoTimestamp(input, `commerce evidence ${field}`);
  const flag = (input, field) => {
    if (typeof input !== 'boolean') {
      throw new Error(`commerce evidence ${field} must be boolean`);
    }
    return input;
  };
  if (
    !['supported', 'partner-gated', 'unsupported', 'unknown'].includes(
      value?.access?.state
    )
  ) {
    throw new Error('commerce evidence needs an account-access receipt');
  }
  return {
    matrixDigest: hash(value.matrixDigest, 'matrixDigest'),
    policyDigest: hash(value.policyDigest, 'policyDigest'),
    geographyDigest: hash(value.geographyDigest, 'geographyDigest'),
    merchantOfRecord: redactionSafeText(
      value.merchantOfRecord,
      'merchantOfRecord',
      128
    ),
    eligible: flag(value.eligible, 'eligible'),
    geographyCompatible: flag(value.geographyCompatible, 'geographyCompatible'),
    hostedMerchReady:
      value.hostedMerchReady == null
        ? null
        : flag(value.hostedMerchReady, 'hostedMerchReady'),
    observedAt: timestamp(value.observedAt, 'observedAt'),
    expiresAt: timestamp(value.expiresAt, 'expiresAt'),
    access: {
      digest: hash(value.access.digest, 'access.digest'),
      state: value.access.state,
      observedAt: timestamp(value.access.observedAt, 'access.observedAt'),
      expiresAt: timestamp(value.access.expiresAt, 'access.expiresAt'),
    },
    // Hash the complete Stripe price identity at the canonical billing owner.
    // Equal dollar amounts alone do not establish the same price/product.
    price:
      value.price == null
        ? null
        : {
            canonicalIdentityDigest: hash(
              value.price.canonicalIdentityDigest,
              'price.canonicalIdentityDigest'
            ),
            observedIdentityDigest: hash(
              value.price.observedIdentityDigest,
              'price.observedIdentityDigest'
            ),
          },
  };
}

/**
 * Adapt a rail-scoped matrix observation and account receipt to JOV-7339's
 * event contract. The accepted snapshot lives on the existing decision;
 * intake/recovery remains with JOV-7315, with no new clock or registry.
 */
export function capabilityEventFromCommerceEvidence(
  evidence,
  { decision, current, provider, now }
) {
  validateDecision(decision);
  const commerce = decision.commerceProjection;
  if (!commerce?.evidence)
    throw new Error('accepted commerce evidence is required');
  const decisionRevision = redactionSafeText(
    commerce.decisionRevision,
    'decisionRevision',
    128
  );
  const accepted = commerceEvidenceSnapshot(commerce.evidence);
  const observed = commerceEvidenceSnapshot(current);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error('now must be a valid Date');
  const reasons = [];
  if (
    [observed, observed.access].some(
      receipt => Date.parse(receipt.expiresAt) <= nowMs
    )
  )
    reasons.push('evidence-expired');
  if (
    [observed, observed.access].some(
      receipt =>
        Date.parse(receipt.observedAt) > nowMs ||
        Date.parse(receipt.observedAt) >= Date.parse(receipt.expiresAt)
    )
  )
    reasons.push('evidence-invalid');
  if (observed.matrixDigest !== accepted.matrixDigest)
    reasons.push('matrix-evidence-changed');
  if (observed.access.digest !== accepted.access.digest)
    reasons.push('account-access-changed');
  if (observed.access.state !== 'supported')
    reasons.push('provider-access-lost');
  if (!observed.eligible || observed.eligible !== accepted.eligible)
    reasons.push('eligibility-changed');
  if (observed.policyDigest !== accepted.policyDigest)
    reasons.push('policy-changed');
  if (
    !observed.geographyCompatible ||
    observed.geographyDigest !== accepted.geographyDigest
  )
    reasons.push('geography-incompatible');
  if (observed.merchantOfRecord !== accepted.merchantOfRecord)
    reasons.push('merchant-changed');
  if (
    observed.hostedMerchReady !== accepted.hostedMerchReady ||
    observed.hostedMerchReady === false
  )
    reasons.push('hosted-merch-readiness-lost');
  if (
    digest(observed.price) !== digest(accepted.price) ||
    observed.price?.observedIdentityDigest !==
      observed.price?.canonicalIdentityDigest
  )
    reasons.push('canonical-price-drift');
  if (reasons.length === 0) return null;
  const invalidation = {
    offer: commerce.offer,
    channel: commerce.channel,
    rail: commerce.rail,
    priorDecision: decision.id,
    decisionRevision,
    matrixEvidenceDigest: observed.matrixDigest,
    accountAccessReceiptDigest: observed.access.digest,
    reasons: reasons.sort(),
    nextReevaluationTrigger: redactionSafeText(
      decision.nextReevaluation,
      'nextReevaluation',
      500
    ),
  };
  const event = capabilityEventFromEvidence(evidence, {
    provider,
    externalChangeId: `commerce-${digest({ invalidation, observed })}`,
    class: reasons.includes('canonical-price-drift')
      ? 'pricing-credit-or-quota'
      : reasons.some(reason =>
            [
              'policy-changed',
              'eligibility-changed',
              'geography-incompatible',
            ].includes(reason)
          )
        ? 'policy-terms-security-or-privacy'
        : 'internal-benchmark-or-runtime',
    capabilityIds: [decision.capabilityId],
  });
  redactionSafeText(event.evidenceId, 'event evidenceId', 256);
  return {
    ...event,
    commerce: invalidation,
    digest: digest({ event: event.digest, invalidation, observed }),
  };
}

function validateDecision(decision) {
  for (const [value, field] of [
    [decision?.id, 'id'],
    [decision?.capabilityId, 'capabilityId'],
    [decision?.scope, 'scope'],
    [decision?.incumbent?.implementation, 'incumbent.implementation'],
    [decision?.incumbent?.owner, 'incumbent.owner'],
    [decision?.chosenDisposition, 'chosenDisposition'],
    [decision?.switchingCost, 'switchingCost'],
    [decision?.reversibility, 'reversibility'],
    [decision?.nextReevaluation, 'nextReevaluation'],
    [decision?.evidence?.id, 'evidence.id'],
    [decision?.evidence?.version, 'evidence.version'],
    [decision?.evidence?.observedAt, 'evidence.observedAt'],
  ])
    text(value, `decision.${field}`);
  for (const field of [
    'materialAssumptions',
    'alternativesConsidered',
    'invalidationTriggers',
  ]) {
    if (
      !Array.isArray(decision[field]) ||
      (field !== 'alternativesConsidered' && decision[field].length === 0)
    ) {
      throw new Error(
        `decision.${field} must be ${field === 'alternativesConsidered' ? 'an array' : 'non-empty'}`
      );
    }
  }
  if (decision.commerceProjection) {
    for (const [value, field] of [
      [decision.commerceProjection.offer, 'offer'],
      [decision.commerceProjection.channel, 'channel'],
      [decision.commerceProjection.rail, 'rail'],
    ]) {
      const token = redactionSafeText(
        value,
        `decision.commerceProjection.${field}`,
        128
      );
      if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(token)) {
        throw new Error(
          `decision.commerceProjection.${field} must be a safe token`
        );
      }
    }
    const issueIds = decision.commerceProjection.issueIds;
    if (
      !Array.isArray(issueIds) ||
      issueIds.length === 0 ||
      issueIds.length > 8 ||
      new Set(issueIds).size !== issueIds.length ||
      issueIds.some(issueId => !/^JOV-[1-9][0-9]*$/u.test(issueId))
    ) {
      throw new Error(
        'decision.commerceProjection.issueIds must contain 1-8 unique JOV issue identifiers'
      );
    }
  }
}

function matchingAssumptions(decision, event) {
  if (event.commerce) {
    const target = event.commerce;
    const commerce = decision.commerceProjection;
    if (
      target.priorDecision !== decision.id ||
      !commerce ||
      target.offer !== commerce.offer ||
      target.channel !== commerce.channel ||
      target.rail !== commerce.rail ||
      target.decisionRevision !== commerce.decisionRevision
    )
      return [];
    return target.reasons.map(id => ({ id }));
  }
  const assumptions = new Map(
    decision.materialAssumptions.map(assumption => [assumption.id, assumption])
  );
  return decision.invalidationTriggers
    .filter(
      trigger =>
        trigger.eventClasses?.includes(event.class) &&
        (!trigger.providers || trigger.providers.includes(event.provider))
    )
    .map(trigger => assumptions.get(trigger.assumptionId))
    .filter(Boolean);
}

function affectedCapabilities(seedIds, graph) {
  const affected = new Set(seedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph) {
      if (
        !affected.has(node.id) &&
        node.dependsOn?.some(id => affected.has(id))
      ) {
        affected.add(node.id);
        changed = true;
      }
    }
  }
  return affected;
}

function issueSnapshot(issue) {
  return {
    title: issue.title ?? null,
    description: issue.description ?? null,
    priority: issue.priority ?? null,
    stateId: issue.state?.id ?? null,
    stateName: issue.state?.name ?? null,
  };
}

function validateBenchmark(benchmark, event, invalidated) {
  if (benchmark?.eventId !== event.id || benchmark?.status !== 'complete') {
    throw new Error('a complete event-bound benchmark is required');
  }
  const results = new Map(
    (benchmark.results ?? []).map(result => [result.decisionId, result])
  );
  for (const decision of invalidated) {
    const result = results.get(decision.id);
    if (!result || !RECONCILIATION_DISPOSITIONS.includes(result.disposition)) {
      throw new Error(`bounded disposition missing for ${decision.id}`);
    }
    text(result.rationale, 'benchmark rationale');
    text(result.nextReevaluation, 'benchmark nextReevaluation');
    for (const key of Object.keys(result.score ?? {})) {
      if (!SCORE_FACTORS.has(key)) {
        throw new Error(`decision score factor is not future-looking: ${key}`);
      }
    }
    if (
      benchmark.evidenceClass === 'marketing-claim' &&
      result.backlogActions?.length
    ) {
      throw new Error(
        'marketing claims may trigger evaluation, not backlog mutation'
      );
    }
  }
  return results;
}

function planLinearReadyUpdates({
  event,
  invalidated,
  results,
  impacts,
  issues,
}) {
  const eligible = new Set(
    impacts
      .filter(impact => impact.mutationEligible)
      .map(impact => impact.issueId)
  );
  const terminal = new Set(
    issues
      .filter(issue => TERMINAL_STATE_TYPES.has(issue.state?.type))
      .map(issue => issue.identifier)
  );
  const updates = invalidated.flatMap(decision => {
    const commerce = decision.commerceProjection;
    if (!commerce) return [];
    const result = results.get(decision.id);
    const nextReevaluation = redactionSafeText(
      result.nextReevaluation,
      'benchmark nextReevaluation',
      500
    );
    const decisionId = redactionSafeText(decision.id, 'decision id', 128);
    const evidenceId = redactionSafeText(
      event.evidenceId,
      'event evidenceId',
      256
    );
    return commerce.issueIds
      .filter(issueId => !terminal.has(issueId))
      .map(issueId => {
        if (!eligible.has(issueId)) {
          throw new Error(`Linear-ready update is not eligible: ${issueId}`);
        }
        const id = `${decisionId}:${issueId}:commerce-projection`;
        const body = [
          `Commerce capability invalidated by ${event.id}.`,
          `Offer: ${commerce.offer}`,
          `Channel: ${commerce.channel}`,
          `Rail: ${commerce.rail}`,
          `Prior decision: ${decisionId}`,
          `Invalidating evidence: ${evidenceId}`,
          `Next re-evaluation: ${nextReevaluation}`,
        ].join('\n');
        boundedText(body, 'Linear-ready update body', 2000);
        return {
          id,
          issueId,
          kind: 'comment',
          sourceEventId: event.id,
          sourceEvidenceId: evidenceId,
          body,
        };
      });
  });
  if (updates.length > MAX_LINEAR_READY_UPDATES) {
    throw new Error(
      `Linear-ready updates exceed the ${MAX_LINEAR_READY_UPDATES} update bound`
    );
  }
  if (new Set(updates.map(update => update.id)).size !== updates.length) {
    throw new Error('Linear-ready updates must have unique identities');
  }
  return updates;
}

export function planCapabilityReconciliation({
  event,
  decisions,
  capabilityGraph,
  issues,
  benchmark,
  priorReceipts = [],
}) {
  if (event?.schema !== CAPABILITY_EVENT_SCHEMA)
    throw new Error('invalid capability event');
  const prior = priorReceipts.find(
    receipt => receipt.eventDigest === event.digest
  );
  if (prior) {
    return {
      schema: RECONCILIATION_SCHEMA,
      status: 'unchanged',
      eventId: event.id,
      eventDigest: event.digest,
      actions: [],
      commerceInvalidations: prior.commerceInvalidations ?? [],
      linearReadyUpdates: [],
    };
  }
  decisions.forEach(validateDecision);
  const affected = affectedCapabilities(event.capabilityIds, capabilityGraph);
  const invalidated = decisions
    .filter(decision => affected.has(decision.capabilityId))
    .map(decision => ({
      ...decision,
      brokenAssumptions: matchingAssumptions(decision, event),
    }))
    .filter(decision => decision.brokenAssumptions.length > 0);
  // Closing a stale rail is deterministic and does not adopt a supplier or
  // change economics. Reopening/reranking still needs the existing benchmark.
  const results = validateBenchmark(
    event.commerce
      ? {
          eventId: event.id,
          status: 'complete',
          results: invalidated.map(decision => ({
            decisionId: decision.id,
            disposition: 'DEFER',
            confidence: 'high',
            rationale: event.commerce.reasons.join(', '),
            nextReevaluation: event.commerce.nextReevaluationTrigger,
          })),
        }
      : benchmark,
    event,
    invalidated
  );
  const issueById = new Map(issues.map(issue => [issue.identifier, issue]));
  const commerceIssueIds = event.commerce
    ? new Set(
        invalidated.flatMap(decision => decision.commerceProjection.issueIds)
      )
    : null;
  const refs = capabilityGraph
    .filter(node => affected.has(node.id))
    .flatMap(node => node.linearIssues ?? [])
    .filter(ref => !commerceIssueIds || commerceIssueIds.has(ref.id));
  const impacts = [...new Map(refs.map(ref => [ref.id, ref])).values()].flatMap(
    ref => {
      const issue = issueById.get(ref.id);
      if (!issue) return [];
      const terminal = TERMINAL_STATE_TYPES.has(issue.state?.type);
      if (
        terminal &&
        (ref.role !== 'foundation' || issue.state?.type !== 'completed')
      )
        return [];
      return [
        {
          issueId: ref.id,
          role: ref.role,
          terminal,
          mutationEligible: !terminal,
        },
      ];
    }
  );
  const eligible = new Set(
    impacts
      .filter(impact => impact.mutationEligible)
      .map(impact => impact.issueId)
  );
  const actions = invalidated.flatMap(decision =>
    (results.get(decision.id).backlogActions ?? []).map(action => {
      if (
        requiresOviCertification(decision) ||
        results.get(decision.id).confidence !== 'high'
      ) {
        throw new Error(
          'backlog mutation requires high confidence and existing Summer authority'
        );
      }
      if (
        !MUTATION_KINDS.has(action.kind) ||
        !eligible.has(action.issueId) ||
        (action.kind === 'rerank' && !Number.isInteger(action.priority))
      ) {
        throw new Error(`backlog action is not eligible: ${action.issueId}`);
      }
      const issue = issueById.get(action.issueId);
      return {
        ...action,
        id: action.id ?? `${decision.id}:${action.issueId}:${action.kind}`,
        decisionId: decision.id,
        sourceEventId: event.id,
        sourceEvidenceId: event.evidenceId,
        before: issueSnapshot(issue),
        beforeDigest: digest(issueSnapshot(issue)),
      };
    })
  );
  const linearReadyUpdates = planLinearReadyUpdates({
    event,
    invalidated,
    results,
    impacts,
    issues,
  });
  return {
    schema: RECONCILIATION_SCHEMA,
    status: 'ready',
    eventId: event.id,
    eventDigest: event.digest,
    evidenceId: event.evidenceId,
    invalidated: invalidated.map(decision => ({
      decisionId: decision.id,
      brokenAssumptions: decision.brokenAssumptions.map(
        assumption => assumption.id
      ),
      disposition: results.get(decision.id).disposition,
      confidence: results.get(decision.id).confidence,
      nextReevaluation: results.get(decision.id).nextReevaluation,
      requiresOvi: requiresOviCertification(decision),
    })),
    impacts,
    actions,
    commerceInvalidations:
      event.commerce && invalidated.length
        ? [
            {
              ...event.commerce,
              invalidatingEvidence: event.evidenceId,
              sourceEventId: event.id,
              state: 'blocked',
              canary: 'invalidated',
            },
          ]
        : [],
    linearReadyUpdates,
  };
}

export async function applyCapabilityReconciliation(receipt, client) {
  if (receipt?.schema !== RECONCILIATION_SCHEMA || receipt.status !== 'ready') {
    throw new Error('only a ready reconciliation receipt can mutate Linear');
  }
  const outcomes = [];
  for (const action of receipt.actions) {
    const marker = `<!-- capability-reconciliation:${action.sourceEventId}:${action.id}:applied -->`;
    const before = await client.fetchIssue(action.issueId);
    if (
      before.comments?.nodes?.some(comment => comment.body.includes(marker))
    ) {
      outcomes.push({ actionId: action.id, status: 'unchanged' });
      continue;
    }
    if (
      TERMINAL_STATE_TYPES.has(before.state?.type) ||
      digest(issueSnapshot(before)) !== action.beforeDigest
    ) {
      throw new Error(`stale or terminal Linear issue: ${action.issueId}`);
    }
    await client.addComment(
      before.id,
      `<!-- capability-reconciliation:${action.sourceEventId}:${action.id}:intent -->\nSource evidence: ${action.sourceEvidenceId}\nDecision: ${action.decisionId}\nPlanned mutation: ${action.kind}`
    );
    if (action.kind === 'cancel') {
      await client.transitionIssue(
        before.id,
        text(action.targetStateId, 'targetStateId')
      );
    } else {
      await client.updateIssue(
        before.id,
        action.kind === 'rewrite'
          ? { description: text(action.description, 'description') }
          : { priority: action.priority }
      );
    }
    const after = await client.fetchIssue(action.issueId);
    const verified =
      (action.kind === 'cancel' && after.state?.id === action.targetStateId) ||
      (action.kind === 'rewrite' && after.description === action.description) ||
      (action.kind === 'rerank' && after.priority === action.priority);
    if (!verified)
      throw new Error(`Linear mutation readback failed: ${action.issueId}`);
    await client.addComment(
      after.id,
      `${marker}\nSource evidence: ${action.sourceEvidenceId}\nRollback snapshot digest: ${action.beforeDigest}`
    );
    const final = await client.fetchIssue(action.issueId);
    if (
      !final.comments?.nodes?.some(comment => comment.body.includes(marker))
    ) {
      throw new Error(`Linear audit readback failed: ${action.issueId}`);
    }
    outcomes.push({ actionId: action.id, status: 'verified' });
  }
  for (const update of receipt.linearReadyUpdates ?? []) {
    const marker = `<!-- capability-reconciliation:${update.sourceEventId}:${update.id}:linear-update -->`;
    const before = await client.fetchIssue(update.issueId);
    if (
      before.comments?.nodes?.some(comment => comment.body.includes(marker))
    ) {
      outcomes.push({ updateId: update.id, status: 'unchanged' });
      continue;
    }
    if (TERMINAL_STATE_TYPES.has(before.state?.type)) {
      throw new Error(`terminal Linear issue: ${update.issueId}`);
    }
    await client.addComment(before.id, `${marker}\n${update.body}`);
    const after = await client.fetchIssue(update.issueId);
    if (
      !after.comments?.nodes?.some(comment => comment.body.includes(marker))
    ) {
      throw new Error(`Linear update readback failed: ${update.issueId}`);
    }
    outcomes.push({ updateId: update.id, status: 'verified' });
  }
  return { ...receipt, outcomes };
}
