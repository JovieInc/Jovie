import { createHash } from 'node:crypto';
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as yaml from 'js-yaml';

import { normalizeObservation } from '../idea-radar/idea-radar.mjs';
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
export const STACK_CHANGE_TYPES = Object.freeze(
  'breaking-migration capability-behavior-change deprecation-eol prerelease recommendation-change security-patch stable-feature-release'.split(
    ' '
  )
);
export const CAPABILITY_LIFECYCLE_ATTRIBUTES = Object.freeze(
  'default-existing-apps default-new-apps deprecated experimental recommended removed stable'.split(
    ' '
  )
);
export const ADOPTION_COVERAGE_CLASSES = Object.freeze(
  'blocked-deferred-valid-exception legitimately-inapplicable needs-migration unknown verified-aligned'.split(
    ' '
  )
);

const STACK_COMPONENTS = Object.freeze(
  '@neondatabase/serverless @playwright/test @sentry/nextjs @tanstack/react-pacer @tanstack/react-query @tanstack/react-table @tanstack/react-virtual ai better-auth drizzle-orm next react react-dom stripe tailwindcss turbo vercel vitest'.split(
    ' '
  )
);

function officialSource(packageName) {
  if (packageName.startsWith('@tanstack/')) return 'https://tanstack.com/blog';
  if (packageName === 'next')
    return 'https://github.com/vercel/next.js/releases';
  return `https://www.npmjs.com/package/${packageName}?activeTab=versions`;
}

export const NEXT_CACHE_COMPONENTS_EXCEPTION = Object.freeze({
  scope: 'apps/web Cache Components enablement',
  blocker:
    '245 route files export dynamic or revalidate, which must migrate before cacheComponents can build safely',
  owner: 'web-platform',
  lastTestedVersion: '16.4.0',
  lastTestedAt: '2026-10-14T00:00:00.000Z',
  nextAction:
    'migrate route-segment exports by route family, then compare build, memory, initial JS, latency, and defects',
  reviewAt: '2026-11-14T00:00:00.000Z',
  reviewTrigger:
    'legacy route-segment file count reaches zero or Next changes the migration contract',
});
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

function requireFields(value, fields, label) {
  for (const field of fields.split(' '))
    text(value?.[field], `${label}.${field}`);
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

/** @typedef {string | { version?: string }} LockSpec */
/** @typedef {Record<string, Record<string, LockSpec> | undefined>} DepBlock */
/** @typedef {{ importers: Record<string, DepBlock> }} PnpmLock */

function filesUnder(root, directory) {
  const start = join(root, directory);
  if (!existsSync(start)) return [];
  return globSync('**/*.{cjs,js,json,mjs,ts,tsx}', {
    cwd: start,
    exclude: ['**/.next/**', '**/node_modules/**'],
  })
    .map(path => join(start, path))
    .filter(path => statSync(path).isFile());
}

export function buildStackInventory(root, commitSha, priorInventory = null) {
  text(commitSha, 'commitSha');
  const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
  const lock = /** @type {PnpmLock} */ (yaml.load(lockText));
  const rootPackageText = readFileSync(join(root, 'package.json'), 'utf8');
  const rootPackage = JSON.parse(rootPackageText);
  const manifests = [];
  const rows = [];
  for (const importer of Object.keys(lock.importers).sort()) {
    const manifestPath = join(root, importer, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifestText = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    manifests.push([relative(root, manifestPath), manifestText]);
    const declared = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    };
    const locked = {
      ...lock.importers[importer].dependencies,
      ...lock.importers[importer].devDependencies,
      ...lock.importers[importer].optionalDependencies,
    };
    const sources = filesUnder(root, importer).map(path => [
      relative(root, path),
      readFileSync(path, 'utf8'),
    ]);
    manifests.push(...sources);
    for (const packageName of STACK_COMPONENTS) {
      if (!declared[packageName]) continue;
      const descriptor = locked[packageName];
      const version =
        typeof descriptor === 'string' ? descriptor : descriptor?.version;
      const packagePattern = new RegExp(
        `(?:from\\s*|import\\s*\\()['"]${packageName.replaceAll('/', '\\/')}(?:/|['"])`,
        'u'
      );
      rows.push({
        app: importer,
        package: packageName,
        owner: importer === '.' ? 'platform' : importer,
        declaredRange: declared[packageName],
        resolvedVersion: version?.split('(')[0] ?? null,
        deployedVersion: null,
        deploymentFreshness: 'unknown-until-runtime-receipt',
        override: rootPackage.pnpm?.overrides?.[packageName] ?? null,
        officialSource: officialSource(packageName),
        supportedChannels:
          'stable security-advisory prerelease-observe-only'.split(' '),
        compatibilityConstraints: manifest.engines ?? rootPackage.engines ?? {},
        usageFiles: sources
          .filter(([, content]) => packagePattern.test(content))
          .map(([path]) => path),
      });
    }
  }
  const configFiles = [
    '.nvmrc',
    'turbo.json',
    ...globSync(
      '{apps,packages,workers}/*/{next.config.js,next.config.mjs,vercel.json}',
      { cwd: root }
    ),
  ].filter(path => existsSync(join(root, path)));
  const sourceDigest = digest([
    lockText,
    rootPackageText,
    manifests,
    configFiles.map(path => [path, readFileSync(join(root, path), 'utf8')]),
  ]);
  return {
    schema: 'jovie.stack-inventory/v1',
    status:
      priorInventory?.sourceDigest === sourceDigest ? 'reused' : 'refreshed',
    commitSha,
    sourceDigest,
    rows,
    toolchain: {
      node: rootPackage.engines?.node ?? null,
      packageManager: rootPackage.packageManager ?? null,
      patches: rootPackage.pnpm?.patchedDependencies ?? {},
      turbo: rootPackage.devDependencies?.turbo ?? null,
    },
    configFiles,
  };
}

export function stackAdoptionCoverage(root) {
  const surfaces = new Map();
  const mark = (path, classification, evidence) => {
    const id = relative(root, path);
    const rank = ADOPTION_COVERAGE_CLASSES.indexOf(classification);
    const previous = surfaces.get(id);
    if (
      !previous ||
      rank < ADOPTION_COVERAGE_CLASSES.indexOf(previous.classification)
    ) {
      surfaces.set(id, { id, classification, evidence });
    }
  };
  const config = join(root, 'apps/web/next.config.js');
  const configText = readFileSync(config, 'utf8');
  mark(
    config,
    /^\s*cacheComponents\s*:\s*true/mu.test(configText)
      ? 'verified-aligned'
      : 'blocked-deferred-valid-exception',
    'effective Cache Components flag'
  );
  for (const path of [
    ...filesUnder(root, 'apps/web/app'),
    ...filesUnder(root, 'apps/web/lib'),
  ]) {
    if (/\.(?:stories|test)\.[^.]+$/u.test(path)) continue;
    const content = readFileSync(path, 'utf8');
    if (
      /^\s*export const (?:dynamic|fetchCache|revalidate)\s*=/mu.test(content)
    )
      mark(path, 'needs-migration', 'legacy route-segment cache export');
    if (/unstable_cache\s*\(/u.test(content))
      mark(path, 'needs-migration', 'older Next cache substitute');
    if (content.includes('@tanstack/react-query')) {
      mark(
        path,
        /HydrationBoundary|\bdehydrate\s*\(/u.test(content)
          ? 'unknown'
          : 'verified-aligned',
        'TanStack client state or hydration ownership'
      );
    }
  }
  const counts = Object.fromEntries(
    ADOPTION_COVERAGE_CLASSES.map(classification => [
      classification,
      [...surfaces.values()].filter(
        row => row.classification === classification
      ).length,
    ])
  );
  return {
    denominator: surfaces.size,
    counts,
    surfaces: [...surfaces.values()],
  };
}

function validateLifecycle(facts) {
  for (const [index, fact] of (facts ?? []).entries()) {
    if (!CAPABILITY_LIFECYCLE_ATTRIBUTES.includes(fact.attribute))
      throw new Error(`lifecycle[${index}].attribute is invalid`);
    requireFields(fact, 'scope evidenceUrl effectiveAt', `lifecycle[${index}]`);
    if (fact.attribute === 'removed' && fact.explicit !== true)
      throw new Error(
        'removed lifecycle state requires explicit official evidence'
      );
  }
}

export function adaptStackDelta(delta, source, priorSourceKeys = [], nowUtc) {
  if (source?.status !== 'ok') {
    const delayHours = Math.min(24, 2 ** Math.max(0, source?.attempts ?? 0));
    return {
      status: 'stale',
      freshness: 'unknown',
      researchPerformed: false,
      reason: text(source?.error, 'source.error'),
      retryAt: new Date(Date.parse(nowUtc) + delayHours * 36e5).toISOString(),
    };
  }
  if (!STACK_CHANGE_TYPES.includes(delta?.changeType))
    throw new Error('unknown stack change type');
  validateLifecycle(delta.lifecycle);
  const sourceKey = digest([
    text(delta.packageName, 'packageName'),
    text(delta.externalId, 'externalId'),
    text(source.revision, 'source.revision'),
  ]);
  if (priorSourceKeys.includes(sourceKey)) {
    return { status: 'unchanged', sourceKey, researchPerformed: false };
  }
  const evidence = normalizeObservation({
    problemOpportunity: delta.summary,
    affectedUser: 'Jovie engineering and users of affected routes',
    affectedCapability: delta.capabilityIds.join(', '),
    sourceUrl: delta.sourceUrl,
    sourceType: 'official-stack-release-or-guidance',
    sourceItemId: `${delta.packageName}:${delta.externalId}:${source.revision}`,
    observedAt: delta.observedAt,
    accessConstraints: 'public official source',
    freshness: delta.missedEvent ? 'recovered missed event' : 'event delivery',
    engagementQuality: 1,
    evidenceQuality: 'official primary source',
    initialDemandEvidence:
      'architecture maintenance signal; not customer demand',
    uncertainty: delta.uncertainty ?? 'bounded by source scope',
    cheapestValidationAction:
      'inventory affected surfaces and run bounded checks',
    capacityClass: 'maintenance-bounded',
    revenuePathConflict: 'preemptible behind revenue-critical work',
  });
  const className =
    {
      'security-patch': 'policy-terms-security-or-privacy',
      'deprecation-eol': 'deprecation',
      'breaking-migration': 'protocol-or-platform',
      prerelease: 'protocol-or-platform',
    }[delta.changeType] ?? 'new-or-improved-capability';
  const base = capabilityEventFromEvidence(evidence, {
    provider: delta.packageName,
    externalChangeId: `${delta.externalId}:${source.revision}`,
    class: className,
    capabilityIds: delta.capabilityIds,
  });
  const event = {
    ...base,
    changeType: delta.changeType,
    lifecycle: delta.lifecycle,
  };
  event.digest = digest(event);
  return {
    status: 'changed',
    discovery: delta.missedEvent ? 'catch-up' : 'process-now',
    sourceKey,
    sourceRevision: source.revision,
    researchPerformed: true,
    evidence,
    event,
  };
}

function validateException(exception, nowUtc) {
  requireFields(
    exception,
    'scope blocker owner lastTestedVersion lastTestedAt nextAction reviewAt reviewTrigger',
    'exception'
  );
  if (exception.reviewAt <= exception.lastTestedAt)
    throw new Error('exception review must follow its last test');
  return { ...exception, overdue: exception.reviewAt < nowUtc };
}

export function assessStackAdoption({
  event,
  inventory,
  coverage,
  decisions,
  exception = null,
  assessedAt,
  verifiedAt = null,
}) {
  if (inventory?.commitSha == null || inventory?.sourceDigest == null)
    throw new Error('commit-bound stack inventory is required');
  if (
    coverage.denominator !==
    ADOPTION_COVERAGE_CLASSES.reduce(
      (sum, classification) => sum + (coverage.counts[classification] ?? 0),
      0
    )
  )
    throw new Error('coverage denominator must account for every surface');
  const byKind = new Map(decisions.map(decision => [decision.kind, decision]));
  for (const kind of ['architecture', 'capability', 'upgrade']) {
    const decision = byKind.get(kind);
    if (!decision) throw new Error(`missing separate ${kind} decision`);
    if (!RECONCILIATION_DISPOSITIONS.includes(decision.disposition))
      throw new Error(`${kind} disposition is invalid`);
    requireFields(
      decision,
      'owner confidence rationale evidence nextReevaluation',
      kind
    );
    if (Object.values(decision.outcomes ?? {}).filter(Boolean).length < 5)
      throw new Error(`${kind}.outcomes must cover maintenance trade-offs`);
  }
  const mature = event.lifecycle.some(fact =>
    ['default-existing-apps', 'default-new-apps', 'recommended'].includes(
      fact.attribute
    )
  );
  const capabilityDecision = byKind.get('capability');
  const checkedException =
    exception == null ? null : validateException(exception, assessedAt);
  if (
    mature &&
    coverage.counts['needs-migration'] > 0 &&
    capabilityDecision.disposition !== 'ADOPT' &&
    !checkedException
  )
    throw new Error(
      'mature recommended capability requires adoption or a valid exception'
    );
  const observedMs = Date.parse(event.observedAt);
  return {
    schema: 'jovie.stack-adoption-assessment/v1',
    eventId: event.id,
    inventoryCommit: inventory.commitSha,
    inventoryDigest: inventory.sourceDigest,
    decisions: [...byKind.values()],
    coverage,
    exception: checkedException,
    summerMetrics: {
      freshness: 'current',
      unreviewedMaterialChanges: 0,
      releaseToDispositionMs: Date.parse(assessedAt) - observedMs,
      releaseToVerifiedAdoptionMs: verifiedAt
        ? Date.parse(verifiedAt) - observedMs
        : null,
      overdueDeferrals: checkedException?.overdue ? 1 : 0,
    },
  };
}

export function assertStackPatternRatchet(root, maximumLegacyFiles = 245) {
  const config = readFileSync(join(root, 'apps/web/next.config.js'), 'utf8');
  if (
    /cacheComponents (?:disabled|removed) due to incompatibility with runtime=['"]nodejs/u.test(
      config
    )
  )
    throw new Error('retired Node.js Cache Components blocker was recreated');
  const legacy = stackAdoptionCoverage(root).surfaces.filter(
    surface => surface.evidence === 'legacy route-segment cache export'
  );
  if (legacy.length > maximumLegacyFiles)
    throw new Error(`legacy Cache Components surface grew to ${legacy.length}`);
  return { legacyFiles: legacy.length };
}

export function planStackCapabilityReconciliation(input) {
  const source = adaptStackDelta(
    input.delta,
    input.source,
    input.priorReceipts.map(receipt => receipt.sourceKey).filter(Boolean),
    input.nowUtc
  );
  if (source.status !== 'changed') return source;
  const coverage = stackAdoptionCoverage(input.root);
  const assessment = assessStackAdoption({
    event: source.event,
    inventory: input.inventory,
    coverage,
    decisions: input.stackDecisions,
    exception: input.exception,
    assessedAt: input.nowUtc,
    verifiedAt: input.verifiedAt,
  });
  const backlog = planCapabilityReconciliation({
    ...input.reconciliation,
    event: source.event,
    priorReceipts: input.priorReceipts
      .map(receipt => receipt.backlog)
      .filter(Boolean),
  });
  return {
    schema: 'jovie.stack-adoption-reconciliation/v1',
    ...source,
    inventory: input.inventory,
    assessment,
    backlog,
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
