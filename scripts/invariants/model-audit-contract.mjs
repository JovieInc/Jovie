import { createHash } from 'node:crypto';

export const AUDIT_RECEIPT_SCHEMA = 'jovie-invariant-model-audit-receipt/v1';
export const AUDIT_PROBE_SCHEMA = 'jovie-invariant-model-probe/v1';
export const AUDIT_PROPOSAL_SCHEMA = 'jovie-invariant-model-audit-proposal/v1';
export const AUDIT_CAPABILITIES = new Set([
  'review',
  'semantic',
  'architecture',
  'root-cause',
]);

export function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function invariantVersion(invariant) {
  return `${invariant.id}@${invariant.effective.date}.${invariant.effective.version}`;
}

export function validateLivingInvariantSet(invariants) {
  const byId = new Map(invariants.map(invariant => [invariant.id, invariant]));
  const requirements = [
    ['JOV-INV-023', 'economics.customer-value.direction', 'increase'],
    ['JOV-INV-024', 'economics.delivery-unit-cost.direction', 'decrease'],
    ['JOV-INV-025', 'economics.contribution-profit.direction', 'increase'],
  ];
  const errors = [];
  for (const [id, policyKey, direction] of requirements) {
    const invariant = byId.get(id);
    if (invariant?.policy?.key !== policyKey) {
      errors.push(`${id} must remain a distinct ${policyKey} policy`);
    }
    if (invariant?.policy?.value?.direction !== direction) {
      errors.push(`${id} direction must be ${direction}`);
    }
  }
  if (byId.get('JOV-INV-025')?.policy?.value?.icp !== 'wedge-not-ceiling') {
    errors.push('JOV-INV-025 must preserve the ICP as a wedge, not a ceiling');
  }
  const cadence = byId.get('JOV-INV-026')?.policy?.value;
  if (
    cadence?.trigger !== 'model-catalog-change' ||
    cadence?.schedule !== 'backstop-only' ||
    cadence?.proposals !==
      'append-only-explicit-supersession-no-canonical-mutation'
  ) {
    errors.push(
      'JOV-INV-026 must keep event-first audit cadence and advisory proposals'
    );
  }
  return errors;
}

export function auditCapableModels(models) {
  return models.filter(model =>
    model.capabilities?.some(capability => AUDIT_CAPABILITIES.has(capability))
  );
}

export function catalogFingerprint(models) {
  const auditModels = auditCapableModels(models).map(model => ({
    id: model.id,
    provider: model.provider,
    model: model.model,
    capabilities: [...model.capabilities].sort(),
    executable: model.agent_executable_default,
    argv: model.agent_argv,
  }));
  return `sha256:${sha256(stableSerialize(auditModels))}`;
}

export function deriveAuditTrigger({
  requestedTrigger,
  previousRuns,
  fingerprint,
}) {
  const previous = previousRuns.at(-1);
  if (
    previous?.catalogFingerprint &&
    previous.catalogFingerprint !== fingerprint
  ) {
    return 'model-catalog-change';
  }
  return requestedTrigger;
}

export function planAuditMatrix({
  invariants,
  models,
  receipts,
  now = Date.now(),
  ttlMs = 7 * 24 * 60 * 60 * 1000,
}) {
  return invariants.flatMap(invariant =>
    models.map(model => {
      const version = invariantVersion(invariant);
      const matching = receipts
        .filter(
          receipt =>
            receipt.invariantId === invariant.id &&
            receipt.invariantVersion === version &&
            receipt.modelId === model.id &&
            receipt.model === model.model &&
            receipt.provider === model.provider
        )
        .sort((a, b) => `${b.auditedAt}`.localeCompare(`${a.auditedAt}`));
      const latest = matching[0];
      let state = latest?.status ?? 'missing';
      if (latest?.status === 'completed') {
        const age = now - Date.parse(latest.auditedAt);
        state = Number.isFinite(age) && age <= ttlMs ? 'current' : 'stale';
      }
      return { invariant, model, invariantVersion: version, latest, state };
    })
  );
}

export function validateAuditResult(result, invariant) {
  const errors = [];
  if (result?.invariantId !== invariant.id) errors.push('invariantId mismatch');
  if (!['uphold', 'revise', 'retire'].includes(result?.verdict)) {
    errors.push('verdict must be uphold, revise, or retire');
  }
  if (!['meaningful', 'hollow'].includes(result?.meaningfulness)) {
    errors.push('meaningfulness must be meaningful or hollow');
  }
  if (
    typeof result?.rationale !== 'string' ||
    result.rationale.trim().length < 40
  ) {
    errors.push('rationale must explain the judgment');
  }
  if (
    typeof result?.failureMode !== 'string' ||
    result.failureMode.trim().length < 20
  ) {
    errors.push('failureMode must name a concrete failure');
  }
  if (typeof result?.metric !== 'string' || result.metric.trim().length < 5) {
    errors.push('metric must name a measurable outcome');
  }
  if (
    ['revise', 'retire'].includes(result?.verdict) &&
    (typeof result?.proposal !== 'string' || result.proposal.trim().length < 20)
  ) {
    errors.push('revise or retire requires a concrete proposal');
  }
  if (
    result?.supersedesProposalId != null &&
    (typeof result.supersedesProposalId !== 'string' ||
      result.supersedesProposalId.trim().length === 0)
  ) {
    errors.push('supersedesProposalId must be null or non-empty');
  }
  return errors;
}

export function parseAuditResponse(output) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [
    fenced,
    output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed?.results)) return parsed;
    } catch {
      // Try the next bounded JSON candidate.
    }
  }
  throw new Error('Model audit response did not contain a JSON results array');
}

export function buildAuditPrompt(invariants) {
  return [
    'You are auditing company invariants. This is read-only analysis.',
    'For every invariant, decide whether it is meaningful, enforceable, non-duplicative, and still directionally correct.',
    'Separate source enforcement truth from your advisory judgment. Do not claim CI, deployment, runtime, or provider proof.',
    'Return JSON only: {"results":[{"invariantId":"...","verdict":"uphold|revise|retire","meaningfulness":"meaningful|hollow","rationale":"at least 40 characters","failureMode":"concrete failure mode","metric":"measurable outcome","proposal":null|"append-only proposed wording","supersedesProposalId":null|"prior proposal id"}]}',
    'Include exactly one result for every invariant below.',
    JSON.stringify(
      invariants.map(item => ({
        id: item.id,
        title: item.title,
        statement: item.statement,
        policy: item.policy,
        scope: item.scope,
        effective: item.effective,
        lifecycle: item.lifecycle,
      }))
    ),
  ].join('\n\n');
}

export function proposalRecords({
  runId,
  auditedAt,
  model,
  invariant,
  result,
}) {
  if (
    typeof result.proposal !== 'string' ||
    result.proposal.trim().length === 0
  ) {
    return [];
  }
  const identity = stableSerialize({
    runId,
    modelId: model.id,
    invariantId: invariant.id,
    proposal: result.proposal.trim(),
  });
  return [
    {
      schema: AUDIT_PROPOSAL_SCHEMA,
      proposalId: `proposal-${sha256(identity).slice(0, 16)}`,
      runId,
      proposedAt: auditedAt,
      modelId: model.id,
      provider: model.provider,
      model: model.model,
      invariantId: invariant.id,
      invariantVersion: invariantVersion(invariant),
      verdict: result.verdict,
      meaningfulness: result.meaningfulness,
      proposal: result.proposal.trim(),
      supersedesProposalId: result.supersedesProposalId ?? null,
      canonicalMutation: false,
    },
  ];
}

export function probeOutcome(model, { stdout = '', stderr = '' }) {
  const output = `${stdout}\n${stderr}`;
  if (/quota|rate.?limit|usage.?limit|credits? exhausted/i.test(output)) {
    return { available: false, reason: 'provider-capacity-exhausted' };
  }
  if (model.probe_mode === 'exit-zero') {
    return { available: true, reason: 'ready' };
  }
  if (model.provider === 'grok' && !stdout.includes(model.model)) {
    return { available: false, reason: 'model-unlisted' };
  }
  if (model.provider === 'codex' && !stdout.includes('GEM_MODEL_READY')) {
    return { available: false, reason: 'auth-or-runtime-failed' };
  }
  if (model.provider === 'ollama' && !stdout.includes(model.model)) {
    return { available: false, reason: 'model-missing' };
  }
  return { available: true, reason: 'ready' };
}

export function classifyAuditFailure(error) {
  const message = String(error?.message ?? error);
  if (error?.code === 'ENOENT') return 'executable-missing';
  if (
    error?.killed ||
    error?.signal === 'SIGTERM' ||
    /timed?\s*out/i.test(message)
  ) {
    return 'audit-timeout';
  }
  if (Number.isInteger(error?.code)) return `audit-command-exit-${error.code}`;
  return 'audit-runtime-failed';
}
