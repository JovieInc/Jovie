// JOV-6475: writing-quality delivery-surface coverage registry.
// Maps every named text delivery surface to its contextual contract and
// accountable owner so product and ops can see exactly where text is gated,
// advisory-only, or still uncovered. Source-only validation: it checks the
// checked-in registry for required fields, honest review modes, resolvable
// evidence, and explicit rollout routing for uncovered paths. It does not
// run a model, dispatch work, or certify copy.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRITING_SURFACES_SCHEMA = 'jovie.writing-surfaces/v1';
export const WRITING_SURFACES_REGISTRY_PATH =
  'scripts/invariants/writing-surfaces-registry.json';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const REVIEW_MODES = new Set(['gated', 'advisory', 'manual', 'uncovered']);
const REVIEW_POINTS = new Set([
  'pre-send',
  'pre-publish',
  'pre-render',
  'post-generation-advisory',
  'none',
]);
const ENFORCEMENTS = new Set(['enforced', 'advisory', 'manual', 'none']);
const CHECK_KINDS = [
  'truth',
  'usefulness',
  'repetition',
  'puffery',
  'instructionLeakage',
  'voice',
];
const PILOT_KINDS = new Set(['product-response', 'ops-report']);
const REQUIRED_SURFACE_FIELDS = [
  'id',
  'producer',
  'repository',
  'owner',
  'audience',
  'purpose',
  'deliveryAdapter',
  'policyVersion',
  'reviewMode',
  'reviewPoint',
  'proofLink',
];
const BLANKET_CLAIM = /every surface|everywhere|all text|all surfaces/i;

export function readWritingSurfacesRegistry(
  path = resolve(ROOT, WRITING_SURFACES_REGISTRY_PATH)
) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateWritingSurfaces(
  registry,
  {
    repoRoot = ROOT,
    existsFile = path => existsSync(resolve(repoRoot, path)),
  } = {}
) {
  const errors = [];
  if (!registry || typeof registry !== 'object')
    return ['writing-surfaces: registry unreadable'];
  if (registry.schema !== WRITING_SURFACES_SCHEMA)
    errors.push(`writing-surfaces-schema: expected ${WRITING_SURFACES_SCHEMA}`);

  const surfaces = Array.isArray(registry.surfaces) ? registry.surfaces : [];
  if (!surfaces.length) errors.push('writing-surfaces: no surfaces recorded');
  const ids = new Set();
  const pilotCounts = { 'product-response': 0, 'ops-report': 0 };

  for (const surface of surfaces) {
    const label = surface?.id ?? '(missing id)';
    for (const field of REQUIRED_SURFACE_FIELDS)
      if (!nonEmpty(surface?.[field]))
        errors.push(`writing-surfaces-field:${label}:${field}`);
    if (!surface) continue;
    if (ids.has(surface.id))
      errors.push(`writing-surfaces-duplicate:${surface.id}`);
    ids.add(surface.id);
    if (surface.repository !== 'JovieInc/Jovie')
      errors.push(`writing-surfaces-repository:${label}`);
    if (!REVIEW_MODES.has(surface.reviewMode))
      errors.push(`writing-surfaces-mode:${label}:${surface.reviewMode}`);
    if (!REVIEW_POINTS.has(surface.reviewPoint))
      errors.push(`writing-surfaces-point:${label}:${surface.reviewPoint}`);

    // Unknown ownership stays explicit: 'unassigned' is allowed only with an
    // owner-routed rollout slice; a silently blank owner fails above.
    const uncovered = surface.reviewMode === 'uncovered';
    const unassigned = surface.owner === 'unassigned';
    const rollout = surface.rollout;
    if (uncovered || unassigned) {
      if (
        !rollout ||
        !nonEmpty(rollout.routeTo) ||
        !nonEmpty(rollout.via) ||
        !nonEmpty(rollout.slice)
      ) {
        errors.push(`writing-surfaces-rollout:${label}`);
      }
    }
    if (!uncovered && !unassigned && rollout != null && rollout !== null)
      errors.push(`writing-surfaces-rollout-unexpected:${label}`);

    const checks = surface.checks ?? {};
    const keys = Object.keys(checks).sort();
    if (
      keys.length !== CHECK_KINDS.length ||
      !CHECK_KINDS.every(kind => keys.includes(kind))
    ) {
      errors.push(`writing-surfaces-checks:${label}`);
    } else {
      for (const kind of CHECK_KINDS) {
        const check = checks[kind];
        if (!ENFORCEMENTS.has(check?.enforcement))
          errors.push(`writing-surfaces-check:${label}:${kind}`);
        else if (check.enforcement !== 'none' && !nonEmpty(check.source))
          errors.push(`writing-surfaces-check-source:${label}:${kind}`);
      }
    }

    // Evidence staleness: every declared source and proof link must resolve
    // inside the repo. A deleted or renamed file fails closed.
    for (const ref of surface.evidenceSources ?? []) {
      if (!nonEmpty(ref) || !existsFile(ref))
        errors.push(`writing-surfaces-evidence:${label}:${ref}`);
    }
    if (
      !Array.isArray(surface.evidenceSources) ||
      !surface.evidenceSources.length
    )
      errors.push(`writing-surfaces-evidence:${label}:none`);
    if (nonEmpty(surface.proofLink) && !existsFile(surface.proofLink))
      errors.push(`writing-surfaces-proof:${label}:${surface.proofLink}`);

    if (surface.pilot != null) {
      if (!PILOT_KINDS.has(surface.pilot?.kind)) {
        errors.push(`writing-surfaces-pilot:${label}`);
      } else {
        pilotCounts[surface.pilot.kind] += 1;
        if (surface.reviewMode === 'uncovered')
          errors.push(`writing-surfaces-pilot-uncovered:${label}`);
        if (!nonEmpty(surface.pilot.scope) || !nonEmpty(surface.pilot.via))
          errors.push(`writing-surfaces-pilot-scope:${label}`);
      }
    }

    // Whole-message streaming before review may only be advisory.
    if (
      surface.reviewPoint === 'post-generation-advisory' &&
      surface.reviewMode === 'gated'
    )
      errors.push(`writing-surfaces-streaming-gated:${label}`);
  }

  for (const kind of PILOT_KINDS)
    if (pilotCounts[kind] !== 1)
      errors.push(`writing-surfaces-pilot-count:${kind}:${pilotCounts[kind]}`);

  // Coverage reports a denominator and a reviewed version — never a blanket
  // 'everywhere' claim.
  const coverage = registry.coverage ?? {};
  if (coverage.denominator !== surfaces.length)
    errors.push(
      `writing-surfaces-denominator:${coverage.denominator}!=${surfaces.length}`
    );
  if (!nonEmpty(coverage.reviewedVersion))
    errors.push('writing-surfaces-reviewed-version:missing');
  if (typeof coverage.claim === 'string' && BLANKET_CLAIM.test(coverage.claim))
    errors.push('writing-surfaces-claim:blanket');

  // The advisory transport must be the artifact-bound Jev Gateway (JOV-6465);
  // no alternative HTTP adapter is registered here.
  const transport = registry.reviewTransport ?? {};
  if (
    transport.adapter !== 'scripts/invariants/jev-gateway.mjs' ||
    transport.mode !== 'advisory' ||
    !existsFile('scripts/invariants/jev-gateway.mjs')
  )
    errors.push('writing-surfaces-transport');

  const input = registry.contractInput ?? {};
  for (const field of [
    'exactCandidate',
    'intendedJob',
    'allowedClaims',
    'evidence',
    'approvedVoiceExamples',
  ])
    if (!input.fields?.includes(field))
      errors.push(`writing-surfaces-input:${field}`);
  if (!nonEmpty(input.contextSeparation))
    errors.push('writing-surfaces-input:contextSeparation');

  return errors;
}
