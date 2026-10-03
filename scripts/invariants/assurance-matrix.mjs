// JOV-INV-037: canonical assurance matrix — coverage-of-coverage for every
// critical failure class (JOV-6064). Extends the JOV-5853 commissioning
// handoff; composes with jovie.certification/v1, JOV-6042 gate integrity and
// the JOV-6043..6063 domain audits. It is not a second certification registry:
// every row cites the owning audit/detector instead of duplicating it.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSURANCE_MATRIX_INVARIANT_ID = 'JOV-INV-037';
export const ASSURANCE_MATRIX_SCHEMA = 'jovie.assurance-matrix/v1';
export const CERTIFICATION_CONTRACT = 'jovie.certification/v1';
export const ASSURANCE_MATRIX_PATH = 'scripts/invariants/assurance-matrix.json';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const MATRIX_LAYERS = Object.freeze([
  'prevent',
  'detectPreRelease',
  'blockPromotion',
  'detectProduction',
  'recover',
]);

export const LAYER_STATES = Object.freeze([
  'absent',
  'unknown',
  'detection-only',
  'blocking-unproven',
  'proven',
  'accepted-risk',
]);

// States that keep a row certifiable for that layer. Detection layers max out
// at detection-only; prevention/promotion/recovery must be proven or carry an
// explicit bounded exception.
const CERTIFIABLE_STATES = Object.freeze({
  prevent: new Set(['proven', 'accepted-risk']),
  detectPreRelease: new Set(['detection-only', 'proven', 'accepted-risk']),
  blockPromotion: new Set(['proven', 'accepted-risk']),
  detectProduction: new Set(['detection-only', 'proven', 'accepted-risk']),
  recover: new Set(['proven', 'accepted-risk']),
});

// Evidence kinds whose ref is a repo path that must exist. A deleted or
// renamed detector, contract, or test is a suppressed control and fails here
// instead of silently inheriting certification.
const REPO_REF_KINDS = new Set(['test', 'source', 'contract', 'doc', 'slo']);
const EVIDENCE_KINDS = new Set([...REPO_REF_KINDS, 'runtime', 'probe']);
const SUPPRESSED_EVIDENCE_STATES = new Set([
  'suppressed',
  'skipped',
  'missing',
  'failed',
  'quarantined',
  'not_applicable',
]);

const ROW_ID_PATTERN = /^AM-[0-9]{3}$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

export function readAssuranceMatrix(repoRoot = REPO_ROOT) {
  return JSON.parse(
    readFileSync(resolve(repoRoot, ASSURANCE_MATRIX_PATH), 'utf8')
  );
}

export function assuranceMatrixDigest(matrix) {
  return digest(matrix);
}

function acceptanceValid(acceptance, asOfMs) {
  if (!isObject(acceptance)) return false;
  if (!hasText(acceptance.authorizedBy) || !hasText(acceptance.reason))
    return false;
  const expires = Date.parse(acceptance.expires ?? '');
  if (!Number.isFinite(expires)) return false;
  if (Number.isFinite(asOfMs) && expires <= asOfMs) return false;
  return true;
}

function validateEvidence(
  entry,
  rowId,
  layer,
  repoRoot,
  asOfMs,
  maxAgeMs,
  errors
) {
  const where = `${rowId}:${layer}`;
  if (!EVIDENCE_KINDS.has(entry?.kind)) {
    errors.push(`evidence:${where}:unknown-kind`);
    return;
  }
  if (!hasText(entry.ref)) errors.push(`evidence:${where}:missing-ref`);
  if (SUPPRESSED_EVIDENCE_STATES.has(entry?.state))
    errors.push(`evidence:${where}:${entry.state}-cannot-attest`);
  if (
    REPO_REF_KINDS.has(entry.kind) &&
    hasText(entry.ref) &&
    !existsSync(resolve(repoRoot, entry.ref))
  )
    errors.push(`evidence:${where}:ref-missing:${entry.ref}`);
  if (entry.observedAt !== undefined) {
    const observed = Date.parse(entry.observedAt);
    if (!Number.isFinite(observed)) {
      errors.push(`evidence:${where}:invalid-observedAt`);
    } else if (
      Number.isFinite(asOfMs) &&
      Number.isFinite(maxAgeMs) &&
      (observed > asOfMs || asOfMs - observed > maxAgeMs)
    ) {
      errors.push(`evidence:${where}:stale-evidence`);
    }
  }
}

/**
 * Layer certification verdict for one row. `blocked` whenever any layer is
 * absent, unknown, detection-only where proof is required, unproven-blocking,
 * or holds an expired/invalid risk acceptance.
 */
export function rowCertification(row, asOfMs) {
  const reasons = [];
  if (!hasText(row?.owner)) reasons.push('missing-owner');
  for (const layer of MATRIX_LAYERS) {
    const entry = row?.layers?.[layer];
    if (!CERTIFIABLE_STATES[layer].has(entry?.state)) {
      reasons.push(`${layer}:${entry?.state ?? 'absent'}`);
      continue;
    }
    if (
      entry.state === 'accepted-risk' &&
      !acceptanceValid(entry.acceptance, asOfMs)
    )
      reasons.push(`${layer}:acceptance-expired-or-incomplete`);
  }
  return {
    id: row?.id ?? null,
    state: reasons.length === 0 ? 'certifiable' : 'blocked',
    reasons,
  };
}

/**
 * Canonical remediation keys for gaps. The same row+layer always produces the
 * same finding id, so repeat observations update one finding instead of
 * spawning duplicates.
 */
export function matrixFindings(matrix, asOfMs) {
  const findings = new Map();
  const add = (id, row, layer, summary) => {
    findings.set(id, { id, row: row?.id ?? null, layer, summary });
  };
  for (const row of matrix?.rows ?? []) {
    if (!hasText(row?.owner))
      add(`${row?.id}/owner`, row, 'owner', 'missing recovery owner');
    for (const layer of MATRIX_LAYERS) {
      const entry = row?.layers?.[layer];
      if (entry?.state === 'absent')
        add(`${row.id}/${layer}`, row, layer, `no ${layer} control recorded`);
      if (entry?.state === 'unknown')
        add(
          `${row.id}/${layer}`,
          row,
          layer,
          `${layer} applicability unverified`
        );
      if (
        entry?.state === 'accepted-risk' &&
        !acceptanceValid(entry.acceptance, asOfMs)
      )
        add(
          `${row.id}/${layer}`,
          row,
          layer,
          'risk acceptance expired or incomplete'
        );
    }
  }
  return [...findings.values()];
}

/** Aggregate blind spots: per failure class, count of non-certifiable layers. */
export function blindSpotsByFailureClass(matrix, asOfMs) {
  const report = {};
  for (const row of matrix?.rows ?? []) {
    const bucket = (report[row.failureClass] ??= {
      rows: 0,
      openLayers: 0,
      byLayer: Object.fromEntries(MATRIX_LAYERS.map(layer => [layer, 0])),
    });
    bucket.rows += 1;
    for (const layer of MATRIX_LAYERS) {
      const entry = row.layers?.[layer];
      const open =
        !CERTIFIABLE_STATES[layer].has(entry?.state) ||
        (entry.state === 'accepted-risk' &&
          !acceptanceValid(entry.acceptance, asOfMs));
      if (open) {
        bucket.openLayers += 1;
        bucket.byLayer[layer] += 1;
      }
    }
  }
  return report;
}

/**
 * Objects that must be covered but are not claimed by any row. An all-green
 * subset of rows can never imply the inventory is covered.
 */
export function uncoveredObjects(matrix) {
  const required = new Set(
    (matrix?.scope?.requiredObjects ?? []).map(item => item.id)
  );
  const covered = new Set();
  for (const row of matrix?.rows ?? [])
    for (const id of row.covers ?? []) covered.add(id);
  return [...required].filter(id => !covered.has(id));
}

/**
 * Material change invalidation: a changed path wakes every row whose
 * invalidatesOn prefixes it (or is prefixed by it).
 */
export function invalidatedRows(matrix, changedPaths = []) {
  const hits = [];
  for (const row of matrix?.rows ?? []) {
    const triggers = row.invalidatesOn ?? [];
    const changed = changedPaths.some(path =>
      triggers.some(
        trigger => path.startsWith(trigger) || trigger.startsWith(path)
      )
    );
    if (changed) hits.push(row.id);
  }
  return hits;
}

export function validateAssuranceMatrix(matrix, { repoRoot = REPO_ROOT } = {}) {
  const errors = [];
  if (!isObject(matrix)) return ['matrix must be an object'];
  if (matrix.schema !== ASSURANCE_MATRIX_SCHEMA)
    errors.push(`schema:expected-${ASSURANCE_MATRIX_SCHEMA}`);
  if (matrix.contract !== CERTIFICATION_CONTRACT)
    errors.push(`contract:expected-${CERTIFICATION_CONTRACT}`);
  if (!hasText(matrix.matrixRevision)) errors.push('matrixRevision:required');
  const asOfMs = Date.parse(matrix.asOf ?? '');
  if (!Number.isFinite(asOfMs)) errors.push('asOf:valid-timestamp-required');
  const maxAgeMs = matrix.evidenceMaxAgeMs;
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1)
    errors.push('evidenceMaxAgeMs:positive-integer-required');

  const requiredObjects = matrix?.scope?.requiredObjects;
  if (!Array.isArray(requiredObjects) || requiredObjects.length === 0) {
    errors.push('scope.requiredObjects:non-empty-required');
  } else {
    const seen = new Set();
    for (const item of requiredObjects) {
      if (!hasText(item?.id) || !hasText(item?.kind))
        errors.push('scope.requiredObjects:incomplete-entry');
      else if (seen.has(item.id))
        errors.push(`scope.requiredObjects:duplicate:${item.id}`);
      else seen.add(item.id);
    }
  }

  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  if (rows.length === 0) errors.push('rows:non-empty-required');
  const byId = new Map();
  const objectIds = new Set(requiredObjects?.map(item => item.id) ?? []);
  for (const row of rows) {
    if (!ROW_ID_PATTERN.test(row?.id ?? '')) {
      errors.push(`row:id-format:${row?.id ?? '<missing>'}`);
    } else if (byId.has(row.id)) {
      errors.push(`row:duplicate:${row.id}`);
    } else {
      byId.set(row.id, row);
    }
    for (const field of ['surface', 'failureClass', 'whatCanGoWrong', 'owner'])
      if (!hasText(row?.[field]))
        errors.push(`row:${row?.id}:missing-${field}`);
    if (!Array.isArray(row?.covers) || row.covers.length === 0)
      errors.push(`row:${row?.id}:covers-required`);
    else
      for (const id of row.covers)
        if (!objectIds.has(id))
          errors.push(`row:${row.id}:covers-unknown-object:${id}`);
    if (!Array.isArray(row?.invalidatesOn) || row.invalidatesOn.length === 0)
      errors.push(`row:${row?.id}:invalidatesOn-required`);
    const layers = row?.layers;
    if (!isObject(layers)) {
      errors.push(`row:${row?.id}:layers-required`);
      continue;
    }
    for (const key of Object.keys(layers))
      if (!MATRIX_LAYERS.includes(key))
        errors.push(`row:${row.id}:unknown-layer:${key}`);
    for (const layer of MATRIX_LAYERS) {
      const entry = layers[layer];
      if (!isObject(entry)) {
        errors.push(`row:${row.id}:${layer}:missing`);
        continue;
      }
      if (!LAYER_STATES.includes(entry.state)) {
        errors.push(`row:${row.id}:${layer}:unknown-state`);
        continue;
      }
      const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
      if (entry.state === 'absent' || entry.state === 'unknown') {
        if (evidence.length > 0)
          errors.push(
            `row:${row.id}:${layer}:${entry.state}-cannot-cite-evidence`
          );
        continue;
      }
      if (entry.state === 'accepted-risk') {
        if (!isObject(entry.acceptance)) {
          errors.push(`row:${row.id}:${layer}:acceptance-required`);
        } else if (!acceptanceValid(entry.acceptance, asOfMs)) {
          errors.push(
            `row:${row.id}:${layer}:acceptance-expired-or-incomplete`
          );
        }
      }
      if (evidence.length === 0 && entry.state !== 'accepted-risk')
        errors.push(`row:${row.id}:${layer}:evidence-required`);
      for (const item of evidence)
        validateEvidence(
          item,
          row.id,
          layer,
          repoRoot,
          asOfMs,
          maxAgeMs,
          errors
        );
    }
  }
  for (const id of uncoveredObjects(matrix))
    errors.push(`coverage:uncovered-object:${id}`);
  validateUiAssurance(matrix, repoRoot, errors);
  return errors;
}

function matrixPolicy(registry) {
  return registry?.invariants?.find(
    item => item?.id === ASSURANCE_MATRIX_INVARIANT_ID
  )?.policy?.value;
}

/** Binds JOV-INV-037's policy to the exact checked-in matrix revision. */
export function validateAssuranceMatrixPolicy(
  registry,
  { repoRoot = REPO_ROOT } = {}
) {
  const errors = [];
  const policy = matrixPolicy(registry);
  if (!policy) return [`missing:${ASSURANCE_MATRIX_INVARIANT_ID}`];
  if (policy.schema !== ASSURANCE_MATRIX_SCHEMA)
    errors.push(`schema:expected-${ASSURANCE_MATRIX_SCHEMA}`);
  if (policy.contract !== CERTIFICATION_CONTRACT)
    errors.push(`contract:expected-${CERTIFICATION_CONTRACT}`);
  if (policy.matrixPath !== ASSURANCE_MATRIX_PATH)
    errors.push(`matrix-path:expected-${ASSURANCE_MATRIX_PATH}`);
  if (policy.unknownApplicability !== 'fail-closed')
    errors.push('unknown-applicability:must-fail-closed');
  for (const layer of MATRIX_LAYERS)
    if (!policy.requiredLayers?.includes(layer))
      errors.push(`required-layers:missing-${layer}`);
  for (const state of LAYER_STATES)
    if (!policy.states?.includes(state)) errors.push(`states:missing-${state}`);
  if (!existsSync(resolve(repoRoot, ASSURANCE_MATRIX_PATH))) {
    errors.push('matrix:file-missing');
    return errors;
  }
  const matrix = readAssuranceMatrix(repoRoot);
  if (policy.matrixRevision !== matrix.matrixRevision)
    errors.push('matrix-revision:mismatch');
  if (policy.evidenceMaxAgeMs !== matrix.evidenceMaxAgeMs)
    errors.push('evidence-max-age:mismatch');
  if (policy.matrixDigest !== assuranceMatrixDigest(matrix))
    errors.push('matrix-digest:mismatch');
  for (const error of validateAssuranceMatrix(matrix, { repoRoot }))
    errors.push(`matrix:${error}`);
  return errors;
}

/**
 * Machine receipt for the exact matrix revision — the artifact that gates a
 * certification scope and feeds the JOV-5919 review packet.
 */
export function assuranceMatrixReceipt(matrix, { repoRoot = REPO_ROOT } = {}) {
  const errors = validateAssuranceMatrix(matrix, { repoRoot });
  const asOfMs = Date.parse(matrix?.asOf ?? '');
  const rows = (matrix?.rows ?? []).map(row => rowCertification(row, asOfMs));
  return {
    schema: ASSURANCE_MATRIX_SCHEMA,
    contract: CERTIFICATION_CONTRACT,
    matrixRevision: matrix?.matrixRevision ?? null,
    digest: assuranceMatrixDigest(matrix),
    valid: errors.length === 0,
    errors,
    totals: {
      rows: rows.length,
      certifiable: rows.filter(row => row.state === 'certifiable').length,
      blocked: rows.filter(row => row.state === 'blocked').length,
    },
    rows,
    findings: matrixFindings(matrix, asOfMs),
    blindSpots: blindSpotsByFailureClass(matrix, asOfMs),
    uncoveredObjects: uncoveredObjects(matrix),
    ui: uiAssuranceReport(matrix),
  };
}

// JOV-7713: UI assurance. The ten UI failure classes are ordinary matrix rows
// whose `ui` block records judgment, detectors with their real enforcement
// point, required exact-build evidence and blind spots. The denominator is the
// `ui-inventory` objects, each bound to an existing registry export; the
// escape corpus replays founder-caught UI escapes. A missing class is UNKNOWN,
// never green, and a detector that is scheduled, manual, advisory or not wired
// is reported as false-green risk rather than counted as protection.

export const UI_FAILURE_CLASSES = Object.freeze([
  'ui-primitive-integrity',
  'ui-layout-geometry',
  'ui-surface-elevation',
  'ui-motion',
  'ui-interaction-state-machine',
  'ui-state-completeness',
  'ui-accessibility',
  'ui-responsive-platform-parity',
  'ui-content-robustness',
  'ui-visual-taste',
]);
export const UI_BLOCKING_ENFORCEMENT = Object.freeze([
  'pr-blocking',
  'merge-group-blocking',
  'path-selected-blocking',
]);
const UI_ENFORCEMENT = new Set([
  ...UI_BLOCKING_ENFORCEMENT,
  'scheduled',
  'manual',
  'advisory',
  'not-wired',
]);
const UI_JUDGMENTS = new Set(['deterministic', 'mixed', 'taste']);
const UI_SEVERITIES = new Set(['high', 'medium', 'low']);
const UI_EVIDENCE_TARGETS = new Set([
  'web-desktop',
  'web-mobile',
  'macos-electron',
  'ios',
]);
const UI_LIVE_STATUSES = new Set(['green', 'red', 'unknown']);
const UI_ESCAPE_ID = /^ESC-UI-[0-9]{3}$/;
const UI_SOURCE = /^([^#]+)#([A-Za-z_$][\w$]*)$/;

const isUiRow = row => UI_FAILURE_CLASSES.includes(row?.failureClass);
const repoPathExists = (repoRoot, ref) =>
  hasText(ref) && existsSync(resolve(repoRoot, ref));

function validateUiInventory(matrix, repoRoot, errors) {
  for (const item of matrix?.scope?.requiredObjects ?? []) {
    if (item?.kind !== 'ui-inventory') continue;
    const match = UI_SOURCE.exec(item.source ?? '');
    if (!match) {
      errors.push(`ui-inventory:${item.id}:source-required`);
      continue;
    }
    const [, path, exportName] = match;
    if (!repoPathExists(repoRoot, path)) {
      errors.push(`ui-inventory:${item.id}:source-missing:${path}`);
      continue;
    }
    const exported = new RegExp(`export const ${exportName}\\b`);
    if (!exported.test(readFileSync(resolve(repoRoot, path), 'utf8')))
      errors.push(`ui-inventory:${item.id}:export-missing:${exportName}`);
  }
}

function validateUiRow(row, uiObjects, repoRoot, errors) {
  const where = `ui:${row.id}`;
  const ui = row.ui;
  if (!isObject(ui)) {
    errors.push(`${where}:block-required`);
    return;
  }
  if (UI_FAILURE_CLASSES[ui.class - 1] !== row.failureClass)
    errors.push(`${where}:class-mismatch`);
  if (!UI_JUDGMENTS.has(ui.judgment)) errors.push(`${where}:judgment`);
  if (!UI_SEVERITIES.has(ui.severity)) errors.push(`${where}:severity`);
  if (!hasText(ui.remediationOwner))
    errors.push(`${where}:remediationOwner-required`);
  for (const id of row.covers ?? [])
    if (!uiObjects.has(id)) errors.push(`${where}:covers-non-ui-object:${id}`);
  for (const ref of ui.authority ?? [])
    if (!repoPathExists(repoRoot, ref))
      errors.push(`${where}:authority-missing:${ref}`);
  const targets = ui.requiredEvidence;
  if (!Array.isArray(targets) || targets.length === 0)
    errors.push(`${where}:requiredEvidence-required`);
  else
    for (const target of targets)
      if (!UI_EVIDENCE_TARGETS.has(target))
        errors.push(`${where}:requiredEvidence-unknown:${target}`);
  for (const evidence of ui.exactBuildEvidence ?? []) {
    if (!UI_EVIDENCE_TARGETS.has(evidence?.target) || !hasText(evidence.ref))
      errors.push(`${where}:exactBuildEvidence-incomplete`);
    if (!Number.isFinite(Date.parse(evidence?.observedAt ?? '')))
      errors.push(`${where}:exactBuildEvidence-observedAt`);
  }
  if (!Array.isArray(ui.detectors)) errors.push(`${where}:detectors-required`);
  for (const detector of ui.detectors ?? []) {
    const id = `${where}:detector:${detector?.ref}`;
    if (!repoPathExists(repoRoot, detector?.ref))
      errors.push(`${id}:ref-missing`);
    if (!UI_ENFORCEMENT.has(detector?.enforcement))
      errors.push(`${id}:enforcement`);
    if (
      detector?.deliberateRed !== undefined &&
      !repoPathExists(repoRoot, detector.deliberateRed)
    )
      errors.push(`${id}:deliberateRed-missing`);
    if (
      detector?.liveStatus !== undefined &&
      !UI_LIVE_STATUSES.has(detector.liveStatus)
    )
      errors.push(`${id}:liveStatus`);
    for (const inventory of detector?.inventory ?? [])
      if (!uiObjects.has(inventory))
        errors.push(`${id}:inventory-unknown:${inventory}`);
  }
}

function validateUiAssurance(matrix, repoRoot, errors) {
  validateUiInventory(matrix, repoRoot, errors);
  const uiObjects = new Set(
    (matrix?.scope?.requiredObjects ?? [])
      .filter(item => item?.kind === 'ui-inventory')
      .map(item => item.id)
  );
  const uiRows = (matrix?.rows ?? []).filter(isUiRow);
  // Every class needs exactly one owning row: a missing class would only
  // report UNKNOWN, and two rows would split ownership.
  for (const failureClass of UI_FAILURE_CLASSES) {
    const count = uiRows.filter(
      row => row.failureClass === failureClass
    ).length;
    if (count === 0) errors.push(`ui:class:${failureClass}:missing-row`);
    if (count > 1) errors.push(`ui:class:${failureClass}:duplicate-row`);
  }
  for (const row of uiRows) validateUiRow(row, uiObjects, repoRoot, errors);
  const rowIds = new Set(uiRows.map(row => row.id));
  const seen = new Set();
  for (const entry of matrix?.uiEscapeCorpus ?? []) {
    const where = `ui-escape:${entry?.id}`;
    if (!UI_ESCAPE_ID.test(entry?.id ?? '') || seen.has(entry.id))
      errors.push(`${where}:id`);
    seen.add(entry?.id);
    if (!hasText(entry?.summary) || !hasText(entry?.issue))
      errors.push(`${where}:incomplete`);
    if (!rowIds.has(entry?.row)) errors.push(`${where}:row-unknown`);
    if (typeof entry?.caught !== 'boolean') errors.push(`${where}:caught`);
    if (
      entry?.fixture !== undefined &&
      !repoPathExists(repoRoot, entry.fixture)
    )
      errors.push(`${where}:fixture-missing`);
    if (entry?.caught === true && entry?.fixture === undefined)
      errors.push(`${where}:caught-requires-fixture`);
  }
}

function freshExactBuildTargets(ui, asOfMs, maxAgeMs) {
  const fresh = new Set();
  for (const evidence of ui?.exactBuildEvidence ?? []) {
    const observed = Date.parse(evidence?.observedAt ?? '');
    if (
      Number.isFinite(observed) &&
      observed <= asOfMs &&
      asOfMs - observed <= maxAgeMs
    )
      fresh.add(evidence.target);
  }
  return fresh;
}

/**
 * Per-class UI verdict. GREEN needs a certifiable row, at least one blocking
 * detector, deliberate red on every blocking detector, no red live lane, every
 * escape caught and fresh exact-build evidence for every required target.
 * UNKNOWN covers missing rows and rows whose only gaps are unknown layers.
 */
export function uiAssuranceReport(matrix) {
  const asOfMs = Date.parse(matrix?.asOf ?? '');
  const maxAgeMs = matrix?.evidenceMaxAgeMs;
  const escapes = matrix?.uiEscapeCorpus ?? [];
  const classes = UI_FAILURE_CLASSES.map(failureClass => {
    const row = (matrix?.rows ?? []).find(
      item => item.failureClass === failureClass
    );
    if (!row)
      return {
        failureClass,
        row: null,
        status: 'UNKNOWN',
        reasons: ['no-row'],
      };
    const reasons = [...rowCertification(row, asOfMs).reasons];
    const detectors = row.ui?.detectors ?? [];
    const falseGreenRisks = [];
    for (const detector of detectors) {
      const blocking = UI_BLOCKING_ENFORCEMENT.includes(detector.enforcement);
      if (!blocking)
        falseGreenRisks.push(`${detector.ref}:${detector.enforcement}`);
      else if (!detector.deliberateRed)
        falseGreenRisks.push(`${detector.ref}:blocking-without-deliberate-red`);
      if (detector.liveStatus === 'red')
        falseGreenRisks.push(`${detector.ref}:live-red`);
    }
    if (!detectors.some(d => UI_BLOCKING_ENFORCEMENT.includes(d.enforcement)))
      reasons.push('no-blocking-detector');
    if (falseGreenRisks.length > 0) reasons.push('false-green-risk');
    const uncaught = escapes
      .filter(entry => entry.row === row.id && entry.caught !== true)
      .map(entry => entry.id);
    if (uncaught.length > 0) reasons.push('uncaught-escapes');
    const fresh = freshExactBuildTargets(row.ui, asOfMs, maxAgeMs);
    const missingEvidence = (row.ui?.requiredEvidence ?? []).filter(
      target => !fresh.has(target)
    );
    if (missingEvidence.length > 0) reasons.push('exact-build-evidence-stale');
    const onlyUnknown = reasons.every(reason => reason.endsWith(':unknown'));
    return {
      failureClass,
      row: row.id,
      judgment: row.ui?.judgment ?? null,
      status: reasons.length === 0 ? 'GREEN' : onlyUnknown ? 'UNKNOWN' : 'RED',
      reasons,
      falseGreenRisks,
      uncaughtEscapes: uncaught,
      missingEvidence,
      remediationOwner: row.ui?.remediationOwner ?? null,
    };
  });
  const count = status => classes.filter(item => item.status === status).length;
  return {
    totals: {
      green: count('GREEN'),
      red: count('RED'),
      unknown: count('UNKNOWN'),
    },
    escapes: {
      total: escapes.length,
      caught: escapes.filter(entry => entry.caught === true).length,
    },
    classes,
  };
}

/**
 * Exact-build UI evidence a merged change owes before Done (JOV-7694 hook):
 * every UI row the changed paths invalidate, with its required targets.
 */
export function uiEvidenceRequirements(matrix, changedPaths = []) {
  const hits = new Set(invalidatedRows(matrix, changedPaths));
  return (matrix?.rows ?? [])
    .filter(row => isUiRow(row) && hits.has(row.id))
    .map(row => {
      const targets = [...(row.ui?.requiredEvidence ?? [])];
      return {
        row: row.id,
        failureClass: row.failureClass,
        targets,
        reason: `${row.failureClass} invalidated; exact-build evidence required on ${targets.join(', ')}`,
      };
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const matrix = readAssuranceMatrix();
  const report = process.argv.includes('--ui')
    ? uiAssuranceReport(matrix)
    : assuranceMatrixReceipt(matrix);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
