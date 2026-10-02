import { createHash } from 'node:crypto';

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
}

function matchingAssumptions(decision, event) {
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
  if (priorReceipts.some(receipt => receipt.eventDigest === event.digest)) {
    return {
      schema: RECONCILIATION_SCHEMA,
      status: 'unchanged',
      eventId: event.id,
      eventDigest: event.digest,
      actions: [],
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
  const results = validateBenchmark(benchmark, event, invalidated);
  const issueById = new Map(issues.map(issue => [issue.identifier, issue]));
  const refs = capabilityGraph
    .filter(node => affected.has(node.id))
    .flatMap(node => node.linearIssues ?? []);
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
  return { schema: RECONCILIATION_SCHEMA, eventId: receipt.eventId, outcomes };
}
