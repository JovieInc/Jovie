/**
 * JOV-7350: qualification-only decision routing for the existing screen gate.
 * Declarations describe intent; they are never approval or delivery receipts.
 * No trusted Gem -> Ovie adapter is available in this process. Keep that gap
 * explicit, including when no declaration is supplied. ENGINEERING.md requires
 * ship-cohort qualification before any new delivery requirement is enforced.
 */
export const SCREEN_DECISION_SCHEMA = 'screen-decision-declarations/v1';
const KINDS = Object.freeze({
  'machine-correctness': 'existing-ci',
  'platform-device-proof': 'Gem',
  'consequential-external-action': 'existing-action-authorization',
  event: 'founder-review',
  'founder-strategy-taste': 'founder-review',
});
const EVENT_CLASSES = new Set(['identity', 'security', 'permanence']);
/** @param {unknown} value
 * @returns {value is keyof typeof KINDS} */
const isKind = value =>
  typeof value === 'string' && Object.hasOwn(KINDS, value);
/** @param {unknown} value
 * @returns {value is Record<string, unknown>} */
const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value
 * @returns {value is string} */
const text = value => typeof value === 'string' && value.trim().length > 0;
/** @param {unknown} value
 * @returns {value is string[]} */
const strings = value =>
  Array.isArray(value) && value.length > 0 && value.every(text);
const onlyKeys = (value, keys) =>
  Object.keys(value).every(key => keys.includes(key));
const samePaths = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  new Set(a).size === a.length &&
  [...a].sort().every((path, index) => path === b[index]);

/**
 * Project untrusted declarations without granting delivery or approval authority.
 * @param {{headSha?: string, changedPaths?: string[], declarations?: unknown, inputError?: unknown}} [options]
 */
export function projectScreenDecisionRouting({
  headSha,
  changedPaths,
  declarations,
  inputError,
} = {}) {
  const paths = [...new Set(changedPaths ?? [])].sort();
  const findings = [];
  const routes = [];
  const covered = new Set();
  const ids = new Set();
  const envelopeValid =
    isObject(declarations) &&
    onlyKeys(declarations, [
      'schema',
      'headSha',
      'changedPaths',
      'decisions',
    ]) &&
    declarations.schema === SCREEN_DECISION_SCHEMA &&
    /^[a-f0-9]{40}$/.test(headSha ?? '') &&
    declarations.headSha === headSha &&
    samePaths(declarations.changedPaths, paths) &&
    Array.isArray(declarations.decisions);
  if (inputError)
    findings.push('decision declaration file could not be read as JSON');
  else if (declarations === undefined)
    findings.push('decision classification unavailable');
  else if (!envelopeValid)
    findings.push(
      'decision declaration schema, exact head or complete change set is invalid'
    );
  if (envelopeValid && !inputError) {
    for (const decision of /** @type {unknown[]} */ (declarations.decisions)) {
      if (
        !isObject(decision) ||
        !onlyKeys(decision, [
          'id',
          'kind',
          'paths',
          'proposedEffect',
          'evidence',
          'eventClass',
        ]) ||
        !text(decision.id) ||
        ids.has(decision.id) ||
        !isKind(decision.kind) ||
        !strings(decision.paths) ||
        new Set(decision.paths).size !== decision.paths.length ||
        !decision.paths.every(path => paths.includes(path)) ||
        !text(decision.proposedEffect) ||
        !strings(decision.evidence) ||
        (decision.kind === 'event'
          ? !text(decision.eventClass) ||
            !EVENT_CLASSES.has(decision.eventClass)
          : decision.eventClass !== undefined)
      ) {
        findings.push('invalid, duplicate or unbound decision declaration');
        continue;
      }
      ids.add(decision.id);
      for (const path of decision.paths) covered.add(path);
      routes.push({
        id: decision.id,
        kind: decision.kind,
        ...(decision.kind === 'event'
          ? { eventClass: decision.eventClass }
          : {}),
        paths: [...decision.paths].sort(),
        proposedEffect: decision.proposedEffect,
        evidence: [...decision.evidence],
        destination: KINDS[decision.kind],
        // INV028: ordinary taste is not a pre-merge human hold. EVENT effects
        // retain their existing authority boundary; this projection grants none.
        reviewBoundary:
          decision.kind === 'event'
            ? 'before-consequential-effect'
            : decision.kind === 'founder-strategy-taste'
              ? 'existing-taste-steering-or-post-landing-certification'
              : 'existing-authority',
        provenance: 'caller-declaration',
        delivery: 'not-verified',
        approval: 'not-verified',
      });
    }
  }
  const unclassifiedPaths = paths.filter(path => !covered.has(path));
  if (unclassifiedPaths.length > 0)
    findings.push('changed paths lack valid decision classification');
  const founderReviewCandidates = routes.filter(
    route => route.destination === 'founder-review'
  );
  return {
    schema: 'screen-decision-routing/v1',
    mode: 'qualification-only',
    headSha,
    changedPaths: paths,
    runtimeProofAuthority: 'Gem',
    classificationAuthority: 'not-verified',
    trustedRoutingAdapter: 'unavailable',
    deliveryVerified: false,
    approvalVerified: false,
    status:
      findings.length > 0
        ? 'classification-unavailable'
        : founderReviewCandidates.length > 0
          ? 'founder-routing-unavailable'
          : 'declaration-only',
    findings,
    unclassifiedPaths,
    routes,
    founderReviewCandidates,
  };
}
