import { createHash } from 'node:crypto';

export const SOURCE_BOUND_SCHEMA = 'jovie-invariant-stewardship-audit/v2';
const HISTORICAL_SCHEMA = 'jovie-invariant-stewardship-audit/v1';
const REGISTRY_PATH = 'canon/invariants.jsonl';
const SNAPSHOT_PATH =
  'apps/web/lib/ovie/generated/invariant-stewardship.current-week.json';
const REGISTRY_SCHEMA = 'jovie-invariant-registry/v1';
const STATES = new Set(['binding', 'adopted', 'superseded']);
const EVENT_KINDS = new Set([
  'source-change',
  'founder-decision-recorded',
  'invariant-enforcement-failed',
  'terminal-result',
  'exception',
  'evidence-threshold-crossed',
  'pending-job',
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function strings(value) {
  return Array.isArray(value) && value.every(text);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function timestamp(value) {
  return (
    text(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) &&
    date(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function causalEventValid(event) {
  return (
    object(event) &&
    EVENT_KINDS.has(event.kind) &&
    [event.id, event.sourceRevision].every(
      value => text(value) && value.length <= 200
    )
  );
}

function canonicalFacts(canonicalSource) {
  let rows;
  try {
    rows = canonicalSource
      .split(/\r?\n/)
      .filter(line => line.trim())
      .map(JSON.parse);
  } catch {
    throw new Error('canonical-source-json-invalid');
  }
  const [metadata, ...invariants] = rows;
  if (
    !object(metadata) ||
    metadata.schema !== REGISTRY_SCHEMA ||
    !text(metadata.version) ||
    !text(metadata.authority?.owner) ||
    !text(metadata.authority?.approvedBy) ||
    invariants.length === 0
  ) {
    throw new Error('canonical-source-metadata-invalid');
  }
  const ids = new Set();
  for (const row of invariants) {
    if (
      !object(row) ||
      !/^JOV-INV-\d{3}$/.test(row.id ?? '') ||
      ids.has(row.id)
    ) {
      throw new Error('canonical-source-identity-invalid');
    }
    ids.add(row.id);
    const scope = row.scope;
    const bindings = [
      row.enforcementConsumers,
      row.evidence?.tests,
      row.evidence?.deliberateRed,
    ];
    if (
      ![
        row.title,
        row.statement,
        row.authority?.owner,
        row.authority?.approvedBy,
        row.policy?.key,
      ].every(text) ||
      !object(scope) ||
      !strings(scope.products) ||
      !scope.products.length ||
      !strings(scope.surfaces) ||
      !scope.surfaces.length ||
      !date(row.effective?.date) ||
      !Number.isInteger(row.effective?.version) ||
      row.effective.version < 1 ||
      !Number.isInteger(row.precedence) ||
      row.policy?.value === undefined ||
      !STATES.has(row.lifecycle?.state) ||
      !strings(row.lifecycle?.supersedes) ||
      !(
        row.lifecycle.supersededBy === null || text(row.lifecycle.supersededBy)
      ) ||
      !bindings.every(
        items =>
          Array.isArray(items) &&
          items.every(
            item => object(item) && text(item.name) && text(item.path)
          )
      ) ||
      (row.lifecycle.state === 'adopted' &&
        (!row.enforcementConsumers.length ||
          !row.evidence.deliberateRed.length))
    ) {
      throw new Error(`canonical-source-fact-invalid:${row.id}`);
    }
  }
  for (const row of invariants) {
    if (row.lifecycle.supersedes.some(id => !ids.has(id))) {
      throw new Error(`canonical-source-supersession-invalid:${row.id}`);
    }
    if (row.lifecycle.state === 'superseded') {
      const successor = invariants.find(
        item => item.id === row.lifecycle.supersededBy
      );
      const bindings = [
        ...row.enforcementConsumers,
        ...row.evidence.tests,
        ...row.evidence.deliberateRed,
      ];
      const externalCustody =
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
          row.lifecycle.supersededBy ?? ''
        ) &&
        bindings.length > 0 &&
        bindings.every(item => item.repo === row.lifecycle.supersededBy);
      if (
        !(successor?.lifecycle.supersedes.includes(row.id) || externalCustody)
      ) {
        throw new Error(`canonical-source-supersession-invalid:${row.id}`);
      }
    }
  }
  const facts = invariants
    .map(row => ({
      ...row,
      source: {
        ref: `${REGISTRY_PATH}#${row.id}`,
        digest: digest(stable(row)),
      },
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { facts, owner: metadata.authority.owner };
}

function intersect(left, right) {
  if (left.includes('*')) return [...new Set(right)].sort();
  if (right.includes('*')) return [...new Set(left)].sort();
  return [...new Set(left.filter(value => right.includes(value)))].sort();
}

function currentFindings(facts, accountableOwner) {
  const findings = [];
  const current = facts.filter(row => row.lifecycle.state !== 'superseded');
  for (let index = 0; index < current.length; index += 1) {
    const left = current[index];
    for (const right of current.slice(index + 1)) {
      if (left.policy.key !== right.policy.key) continue;
      const scope = {
        products: intersect(left.scope.products, right.scope.products),
        surfaces: intersect(left.scope.surfaces, right.scope.surfaces),
      };
      if (!scope.products.length || !scope.surfaces.length) continue;
      const duplicate =
        stable(left.policy.value) === stable(right.policy.value);
      const canonicalOwners = [
        ...new Set([left.authority.owner, right.authority.owner]),
      ].sort();
      findings.push({
        id: `${duplicate ? 'duplicate' : 'conflict'}:${left.id}:${right.id}`,
        kind: duplicate ? 'duplicate' : 'conflicting',
        candidateIds: [left.id, right.id],
        semanticKey: left.policy.key,
        canonicalOwners,
        owner:
          canonicalOwners.length === 1 ? canonicalOwners[0] : accountableOwner,
        scope,
        evidence: [left, right].map(row => ({
          id: row.id,
          owner: row.authority.owner,
          ...row.source,
        })),
        action: duplicate
          ? 'regenerate-derived-projection'
          : 'explicit-decision-required',
      });
    }
  }
  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

/** Regenerate only from canonical source; historical candidates are never promoted. */
export function regenerateStewardshipAudit(
  canonicalSource,
  { causalEvent, generatedAt } = {}
) {
  if (typeof canonicalSource !== 'string')
    throw new Error('canonical-source-missing');
  if (!causalEventValid(causalEvent)) throw new Error('causal-event-invalid');
  if (!timestamp(generatedAt)) throw new Error('generated-at-invalid');
  const { facts, owner } = canonicalFacts(canonicalSource);
  return {
    schemaVersion: SOURCE_BOUND_SCHEMA,
    generated: true,
    authority: 'evidence-only',
    generatedAt,
    canonicalRegistry: { path: REGISTRY_PATH, owner },
    sourceBinding: { path: REGISTRY_PATH, digest: digest(canonicalSource) },
    causalEvent: {
      kind: causalEvent.kind,
      id: causalEvent.id,
      sourceRevision: causalEvent.sourceRevision,
    },
    facts,
    declaredFindings: currentFindings(facts, owner),
    founderQueue: [],
  };
}

/** Verified means current canonical source facts, never execution or admission proof. */
export function evaluateStewardshipSources(
  audit,
  canonicalSource,
  { now = new Date() } = {}
) {
  const result = {
    state: 'invalid',
    errors: [],
    source: {
      path: REGISTRY_PATH,
      digest:
        typeof canonicalSource === 'string' ? digest(canonicalSource) : null,
    },
    facts: [],
    findings: [],
    executionStatus: 'not-certified',
    remediation: null,
  };
  const fail = (state, error) => ({
    ...result,
    state,
    errors: [`${REGISTRY_PATH}: ${error}`],
    remediation: `Read ${REGISTRY_PATH} from the containing artifact and regenerate source-bound stewardship evidence after verifying its causal event; preserve the prior receipt as history.`,
  });
  if (canonicalSource === undefined || canonicalSource === null)
    return fail('unknown', 'canonical-source-missing');
  if (typeof canonicalSource !== 'string')
    return fail('invalid', 'canonical-source-invalid');
  let canonical;
  try {
    canonical = canonicalFacts(canonicalSource);
  } catch (error) {
    return fail(
      'invalid',
      error instanceof Error ? error.message : 'canonical-source-invalid'
    );
  }
  if (
    !object(audit) ||
    audit.authority !== 'evidence-only' ||
    audit.canonicalRegistry?.path !== REGISTRY_PATH ||
    !timestamp(audit.generatedAt)
  ) {
    return fail('invalid', 'stewardship-receipt-invalid');
  }
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    Date.parse(audit.generatedAt) > now.getTime() + 60_000
  ) {
    return fail('invalid', 'generated-at-future-or-clock-invalid');
  }
  if (audit.schemaVersion === HISTORICAL_SCHEMA) {
    if (
      ![
        audit.candidates,
        audit.declaredFindings,
        audit.founderQueue,
        audit.sources,
      ].every(Array.isArray) ||
      !audit.candidates.every(
        row =>
          object(row) &&
          [
            'id',
            'statement',
            'semanticKey',
            'semanticValue',
            'owner',
            'classification',
            'authorityStatus',
            'implementationAuthority',
            'lifecycle',
          ].every(key => text(row[key])) &&
          strings(row.scope) &&
          row.scope.length &&
          strings(row.provenance) &&
          row.provenance.length &&
          text(row.source?.kind) &&
          text(row.source?.ref) &&
          date(row.source?.date) &&
          [row.consumers, row.tests].every(Array.isArray) &&
          object(row.relations) &&
          ['overlaps', 'conflicts', 'supersedes', 'scopeSeparated'].every(key =>
            strings(row.relations[key])
          )
      )
    ) {
      return fail('invalid', 'historical-receipt-invalid');
    }
    return fail('historical', 'historical-receipt-source-unbound');
  }
  if (
    audit.schemaVersion !== SOURCE_BOUND_SCHEMA ||
    !causalEventValid(audit.causalEvent) ||
    !Array.isArray(audit.facts) ||
    !Array.isArray(audit.declaredFindings) ||
    !Array.isArray(audit.founderQueue) ||
    audit.founderQueue.length ||
    audit.sourceBinding?.path !== REGISTRY_PATH ||
    !/^sha256:[a-f0-9]{64}$/.test(audit.sourceBinding?.digest ?? '')
  ) {
    return fail('invalid', 'source-bound-receipt-invalid');
  }
  if (audit.sourceBinding.digest !== result.source.digest) {
    return fail('stale', 'canonical-source-digest-changed');
  }
  const findings = currentFindings(canonical.facts, canonical.owner);
  if (
    stable(audit.facts) !== stable(canonical.facts) ||
    stable(audit.declaredFindings) !== stable(findings) ||
    stable(audit.canonicalRegistry) !==
      stable({ path: REGISTRY_PATH, owner: canonical.owner }) ||
    stable(audit.sourceBinding) !== stable(result.source)
  ) {
    return fail('invalid', 'canonical-projection-drift');
  }
  return { ...result, state: 'verified', facts: canonical.facts, findings };
}

/** One read projection for the CLI and Ovie. Unverified evidence cannot create work. */
export function projectStewardshipEvidence(
  audit,
  canonicalSource,
  options = {}
) {
  const { facts, findings, ...evidence } = evaluateStewardshipSources(
    audit,
    canonicalSource,
    options
  );
  const historical = Array.isArray(audit?.candidates)
    ? audit.candidates.length
    : 0;
  return {
    schemaVersion: audit?.schemaVersion ?? null,
    generatedAt: audit?.generatedAt ?? null,
    window:
      audit?.schemaVersion === HISTORICAL_SCHEMA
        ? (audit?.window ?? null)
        : null,
    canonicalRegistry: {
      path: REGISTRY_PATH,
      ...(text(audit?.canonicalRegistry?.owner)
        ? { owner: audit.canonicalRegistry.owner }
        : {}),
    },
    evidence,
    summary: {
      candidates:
        audit?.schemaVersion === HISTORICAL_SCHEMA ? historical : facts.length,
      actionableExceptions: findings.length,
      founderDecisions: 0,
      sourceGaps: Array.isArray(audit?.sources)
        ? audit.sources.filter(
            source =>
              source?.status !== 'covered' && source?.status !== 'excluded'
          ).length
        : 0,
    },
    actionableExceptions: findings,
    summerQueue: findings,
    founderQueue: [],
    drillDown: SNAPSHOT_PATH,
  };
}
