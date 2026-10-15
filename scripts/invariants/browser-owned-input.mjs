// JOV-7846: a browser-input dimension of the existing certification contract.
// Measurements are evidence, never authority: only the existing trusted
// screen-proof resolver can certify the containing artifact.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve a filesystem path so Vite cannot rewrite the JSON as a browser asset.
export const INPUT_MATRIX = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'browser-owned-input-matrix.json'
    ),
    'utf8'
  )
);
export const INPUT_SCHEMA = 'jovie.browser-owned-input/v1';
const list = value => (Array.isArray(value) ? value : []);
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const asset = value =>
  /^https:\/\/\S+$/.test(value?.url ?? '') &&
  /^sha256:[a-f0-9]{64}$/.test(value?.digest ?? '');

export function inputCells(screenId, matrix = INPUT_MATRIX) {
  return matrix.journeys
    .filter(journey => journey.screens.includes(screenId))
    .flatMap(journey =>
      matrix.environments.flatMap(environment =>
        environment.devices.map(device => ({
          id: `${journey.id}/${environment.id}/${device}`,
          journey,
          environment,
          device,
          scenarios: environment.scenarios.filter(
            scenario =>
              journey.scenarios.includes(scenario) ||
              [
                'keyboard',
                'back-dismiss',
                'browser-chrome-resize',
                'zoom-resize',
              ].includes(scenario)
          ),
        }))
      )
    );
}

/** Audit a DOM snapshot against the declared semantic role; never infer a role
 * from a potentially incorrect autocomplete attribute. Scope includes hidden
 * controls so decoy inputs cannot evade the duplicate classification check. */
export function semanticFindings(fields, expectedRoles, matrix = INPUT_MATRIX) {
  const findings = [];
  for (const role of expectedRoles) {
    const selected = list(fields).filter(field => field?.role === role);
    if (selected.length !== 1)
      findings.push(`semantics:${role}:missing-or-duplicate`);
    for (const field of selected) {
      const contract = matrix.semantics[role];
      if (
        !contract ||
        !contract.types.includes(field.type) ||
        field.autocomplete !== contract.autocomplete ||
        field.inputmode !== contract.inputmode ||
        !text(field.name) ||
        !text(field.label) ||
        field.visible !== true
      )
        findings.push(`semantics:${role}:invalid`);
      if (
        list(fields).some(
          other =>
            other !== field &&
            (other?.name === field.name ||
              (text(other?.autocomplete) &&
                other.autocomplete !== 'off' &&
                other.autocomplete === field.autocomplete))
        )
      )
        findings.push(`semantics:${role}:autofill-decoy`);
    }
  }
  if (
    list(fields).some(
      field => field?.type === 'password' && !expectedRoles.includes(field.role)
    )
  )
    findings.push('semantics:unexpected-credential-classification');
  return findings;
}

const within = (rect, viewport) =>
  rect &&
  viewport &&
  [
    rect.top,
    rect.bottom,
    rect.left,
    rect.right,
    viewport.top,
    viewport.bottom,
    viewport.left,
    viewport.right,
  ].every(finite) &&
  rect.top >= viewport.top - 1 &&
  rect.bottom <= viewport.bottom + 1 &&
  rect.left >= viewport.left - 1 &&
  rect.right <= viewport.right + 1 &&
  rect.bottom > rect.top;

/** Numeric transition detector. Native occlusions must come from real-device
 * evidence; a synthetic viewport resize can exercise this detector only. */
export function transitionFindings(
  samples,
  expectedRoles,
  matrix = INPUT_MATRIX
) {
  const findings = [];
  const states = list(samples);
  if (
    states.length !== matrix.phases.length ||
    matrix.phases.some((phase, index) => states[index]?.phase !== phase)
  )
    return ['transitions:missing-or-unordered'];
  findings.push(...semanticFindings(states[0].fields, expectedRoles, matrix));
  for (const sample of states) {
    const at = sample.phase;
    if (
      ![
        sample.layoutHeight,
        sample.visualHeight,
        sample.visualOffsetTop,
        sample.scrollY,
        sample.horizontalOverflow,
        sample.layoutShift,
      ].every(finite) ||
      sample.layoutHeight <= 0 ||
      sample.visualHeight <= 0 ||
      ![
        sample.viewport?.top,
        sample.viewport?.bottom,
        sample.viewport?.left,
        sample.viewport?.right,
      ].every(finite)
    )
      findings.push(`${at}:viewport-unmeasured`);
    if (
      sample.horizontalOverflow < 0 ||
      sample.horizontalOverflow > 1 ||
      sample.layoutShift < 0 ||
      sample.layoutShift > 0.05
    )
      findings.push(`${at}:layout-jank`);
    if (
      ['focused', 'platform-ui-visible', 'value-filled'].includes(at) &&
      (!within(sample.field, sample.viewport) ||
        sample.fieldHit !== true ||
        sample.focused !== true)
    )
      findings.push(`${at}:field-obscured-or-focus-lost`);
    if (
      sample.actionReachable !== true ||
      !(
        (within(sample.action, sample.viewport) && sample.actionHit === true) ||
        (within(sample.actionProbe?.rect, sample.actionProbe?.viewport) &&
          sample.actionProbe?.hit === true)
      )
    )
      findings.push(`${at}:action-unreachable`);
    if (
      sample.anchorStable !== true ||
      sample.safeAreaCorrect !== true ||
      sample.sheetUnclipped !== true
    )
      findings.push(`${at}:chrome-safe-area-or-sheet`);
  }
  const filled = states[3];
  const opened = states[2];
  if (
    !text(filled.domValue) ||
    filled.domValue !== filled.appValue ||
    filled.valid !== true ||
    filled.nodeId !== states[1].nodeId ||
    !text(filled.nodeId)
  )
    findings.push('autofill:stale-state-or-remount');
  if (Math.abs(filled.scrollY - opened.scrollY) > 2)
    findings.push('autofill:scroll-reset');
  if (states[5].submitCount !== 1) findings.push('submit:duplicate-or-missing');
  if (states[6].restored !== true || states[4].restored !== true)
    findings.push('dismiss-or-back:state-not-restored');
  if (states.some(sample => sample.viewportOscillations !== 0))
    findings.push('viewport:oscillation-or-unmeasured');
  return findings;
}

/** Missing/unsupported cells are explicit UNKNOWN/BLOCKED, never green.
 * Each row must be covered by both deterministic measurements and a real
 * device record, bound to the same exact source and served build. */
export function browserInputVerdict(
  evidence,
  { screenId, headSha, matrix = INPUT_MATRIX }
) {
  const cells = inputCells(screenId, matrix);
  const rows = cells.map(cell => {
    const records = list(evidence?.records).filter(
      record => record?.cellId === cell.id
    );
    if (records.length !== 1)
      return {
        id: cell.id,
        status: records.length ? 'BLOCKED' : 'UNKNOWN',
        findings: ['device evidence missing or duplicate'],
      };
    const record = records[0];
    const findings = [];
    if (cell.environment.support !== 'SUPPORTED')
      findings.push(
        `platform support ${cell.environment.support}: ${cell.environment.reason}`
      );
    if (
      evidence.schema !== INPUT_SCHEMA ||
      !sha(headSha) ||
      record.headSha !== headSha ||
      record.servedBuildSha !== headSha
    )
      findings.push('exact-build identity missing or stale');
    if (
      record.status !== 'PASS' ||
      record.kind !== 'real-device' ||
      !text(record.operator) ||
      !/^https:\/\/\S+$/.test(record.url ?? '') ||
      !asset(record.buildIdentity) ||
      !text(record.osVersion) ||
      !text(record.browserVersion) ||
      !text(record.device) ||
      !text(record.inputUiVersion) ||
      !Number.isFinite(Date.parse(record.capturedAt))
    )
      findings.push('real-device provenance incomplete');
    if (
      !asset(record.recording) ||
      !matrix.phases.every(phase => asset(record.screenshots?.[phase]))
    )
      findings.push('recording or phase screenshots missing');
    if (
      cell.scenarios.some(scenario => record.scenarios?.[scenario] !== 'PASS')
    )
      findings.push('native scenario UNKNOWN/BLOCKED');
    if (
      ['vh', 'dvh', 'svh'].some(unit => record.viewportUnits?.[unit] !== 'PASS')
    )
      findings.push('viewport units unmeasured');
    findings.push(
      ...transitionFindings(record.samples, cell.journey.fields, matrix)
    );
    return {
      id: cell.id,
      status: findings.length ? 'BLOCKED' : 'PASS',
      findings,
    };
  });
  return {
    status: rows.some(row => row.status === 'BLOCKED')
      ? 'BLOCKED'
      : rows.some(row => row.status === 'UNKNOWN')
        ? 'UNKNOWN'
        : 'PASS',
    rows,
  };
}

export function browserInputFindings(evidence, context) {
  return browserInputVerdict(evidence, context)
    .rows.filter(row => row.status !== 'PASS')
    .map(
      row =>
        `browser-owned-input ${row.id}: ${row.status}: ${row.findings.join(', ')}`
    );
}
