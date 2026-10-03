// JOV-6064: assurance matrix contract tests. Green path accepts the checked-in
// matrix; deliberate reds prove omission, stale evidence, wrongly inherited
// certification, and suppressed detectors are detected.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assuranceMatrixReceipt,
  blindSpotsByFailureClass,
  invalidatedRows,
  matrixFindings,
  readAssuranceMatrix,
  rowCertification,
  UI_FAILURE_CLASSES,
  uiAssuranceReport,
  validateAssuranceMatrix,
} from './assurance-matrix.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function healthy() {
  return readAssuranceMatrix();
}

describe('assurance matrix (JOV-6064)', () => {
  it('accepts the checked-in canonical matrix', () => {
    const matrix = healthy();
    assert.deepEqual(validateAssuranceMatrix(matrix), []);
    const receipt = assuranceMatrixReceipt(matrix);
    assert.equal(receipt.valid, true);
    assert.equal(receipt.totals.rows, matrix.rows.length);
  });

  it('keeps absent, unknown, detection-only, unproven, proven and accepted-risk distinct', () => {
    const matrix = healthy();
    const states = new Set();
    for (const row of matrix.rows)
      for (const layer of Object.values(row.layers)) states.add(layer.state);
    for (const expected of [
      'absent',
      'unknown',
      'detection-only',
      'blocking-unproven',
      'proven',
    ])
      assert.ok(states.has(expected), `expected layer state ${expected}`);
  });

  it('blocks rows whose protection chain is unknown, absent, or unproven', () => {
    const matrix = healthy();
    const asOf = Date.parse(matrix.asOf);
    const blocked = matrix.rows.filter(
      row => rowCertification(row, asOf).state === 'blocked'
    );
    assert.ok(blocked.length > 0, 'gaps must remain visible, not greenwashed');
    const row = clone(matrix.rows[0]);
    row.layers.detectProduction = { state: 'unknown', evidence: [] };
    const verdict = rowCertification(row, asOf);
    assert.equal(verdict.state, 'blocked');
    assert.ok(verdict.reasons.includes('detectProduction:unknown'));
  });

  it('deliberate red: an omitted row reports uncovered objects', () => {
    const matrix = healthy();
    matrix.rows = matrix.rows.filter(row => row.id !== 'AM-001');
    const errors = validateAssuranceMatrix(matrix);
    assert.ok(
      errors.some(error => error.startsWith('coverage:uncovered-object:')),
      `expected uncovered-object error, got ${errors.join('; ')}`
    );
  });

  it('deliberate red: stale evidence is rejected', () => {
    const matrix = healthy();
    const entry = matrix.rows[0].layers.prevent.evidence[0];
    entry.observedAt = '2020-01-01T00:00:00Z';
    const errors = validateAssuranceMatrix(matrix);
    assert.ok(
      errors.some(error => error.includes('stale-evidence')),
      `expected stale-evidence error, got ${errors.join('; ')}`
    );
  });

  it('deliberate red: a missing evidence path cannot inherit certification', () => {
    const matrix = healthy();
    matrix.rows[0].layers.detectPreRelease.evidence = [
      {
        kind: 'test',
        ref: 'apps/web/tests/integration/deleted-detector.test.ts',
      },
    ];
    const errors = validateAssuranceMatrix(matrix);
    assert.ok(
      errors.some(error => error.includes('ref-missing')),
      `expected ref-missing error, got ${errors.join('; ')}`
    );
  });

  it('deliberate red: a suppressed detector cannot attest', () => {
    const matrix = healthy();
    matrix.rows[0].layers.blockPromotion.evidence[0].state = 'suppressed';
    const errors = validateAssuranceMatrix(matrix);
    assert.ok(
      errors.some(error => error.includes('suppressed-cannot-attest')),
      `expected suppressed error, got ${errors.join('; ')}`
    );
  });

  it('deliberate red: absent or unknown layers cannot cite evidence', () => {
    const matrix = healthy();
    matrix.rows[0].layers.recover = {
      state: 'unknown',
      evidence: [{ kind: 'doc', ref: 'docs/data-integrity-audit-jov-6044.md' }],
    };
    const errors = validateAssuranceMatrix(matrix);
    assert.ok(
      errors.some(error => error.includes('unknown-cannot-cite-evidence'))
    );
  });

  it('accepts bounded risk acceptance and rejects expired acceptance', () => {
    const matrix = healthy();
    const row = clone(matrix.rows[0]);
    for (const layer of Object.values(row.layers)) {
      layer.state = 'accepted-risk';
      layer.evidence = [];
      layer.acceptance = {
        authorizedBy: 'Founder',
        reason: 'bounded',
        expires: '2027-01-01T00:00:00Z',
      };
    }
    const asOf = Date.parse(matrix.asOf);
    assert.equal(rowCertification(row, asOf).state, 'certifiable');
    row.layers.recover.acceptance.expires = '2020-01-01T00:00:00Z';
    const verdict = rowCertification(row, asOf);
    assert.equal(verdict.state, 'blocked');
    assert.ok(
      verdict.reasons.includes('recover:acceptance-expired-or-incomplete')
    );
  });

  it('generates one canonical finding per gap across re-evaluation', () => {
    const matrix = healthy();
    const first = matrixFindings(matrix, Date.parse(matrix.asOf));
    const second = matrixFindings(matrix, Date.parse(matrix.asOf));
    assert.ok(first.length > 0);
    assert.deepEqual(first, second);
    const ids = first.map(finding => finding.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('AM-001/detectProduction'));
  });

  it('aggregates blind spots by failure class', () => {
    const matrix = healthy();
    const report = blindSpotsByFailureClass(matrix, Date.parse(matrix.asOf));
    assert.ok(report['weak-test-false-confidence'].openLayers >= 3);
    assert.ok(report['cross-tenant-access'].rows === 1);
  });

  it('wakes affected rows when material source changes', () => {
    const matrix = healthy();
    const hits = invalidatedRows(matrix, [
      'apps/web/lib/idempotency.ts',
      'docs/unrelated.md',
    ]);
    assert.ok(hits.includes('AM-004'));
    assert.ok(!hits.includes('AM-009'));
  });

  it('binds receipts to the exact matrix revision', () => {
    const matrix = healthy();
    const receipt = assuranceMatrixReceipt(matrix);
    const mutated = clone(matrix);
    mutated.rows[0].owner = 'operations';
    const changed = assuranceMatrixReceipt(mutated);
    assert.notEqual(receipt.digest, changed.digest);
    assert.equal(receipt.matrixRevision, '2026-10-03.1');
  });
});

// JOV-7713: UI assurance rows. The neighbor case is a fully certified UI row
// (GREEN); each deliberate red injects one false-green shape into that row.
describe('UI assurance matrix (JOV-7713)', () => {
  const PROOF = 'scripts/invariants/assurance-matrix.test.mjs';

  function certifiedUiMatrix() {
    const matrix = healthy();
    const row = matrix.rows.find(
      item => item.failureClass === 'ui-interaction-state-machine'
    );
    for (const layer of Object.keys(row.layers))
      row.layers[layer] = {
        state: 'proven',
        evidence: [{ kind: 'test', ref: PROOF }],
      };
    row.ui.detectors = [
      { ref: PROOF, enforcement: 'pr-blocking', deliberateRed: PROOF },
    ];
    row.ui.exactBuildEvidence = row.ui.requiredEvidence.map(target => ({
      target,
      ref: 'runtime:exact-build',
      observedAt: matrix.asOf,
    }));
    for (const entry of matrix.uiEscapeCorpus)
      if (entry.row === row.id)
        Object.assign(entry, { caught: true, fixture: PROOF });
    return { matrix, row };
  }

  const classReport = (matrix, row) =>
    uiAssuranceReport(matrix).classes.find(item => item.row === row.id);

  it('reports every UI class and keeps an uncovered class UNKNOWN, not green', () => {
    const matrix = healthy();
    assert.deepEqual(validateAssuranceMatrix(matrix), []);
    const report = uiAssuranceReport(matrix);
    assert.deepEqual(
      report.classes.map(item => item.failureClass),
      [...UI_FAILURE_CLASSES]
    );
    for (const item of report.classes.filter(c => c.row === null))
      assert.equal(item.status, 'UNKNOWN');
    assert.equal(report.totals.green, 0, 'current gaps stay visible');
    assert.ok(report.escapes.total > report.escapes.caught);
  });

  it('certifies the neighbor row GREEN when every proof is present', () => {
    const { matrix, row } = certifiedUiMatrix();
    assert.deepEqual(validateAssuranceMatrix(matrix), []);
    assert.equal(classReport(matrix, row).status, 'GREEN');
  });

  it('deliberate red: a scheduled or not-wired detector is false-green risk', () => {
    for (const enforcement of ['scheduled', 'not-wired', 'advisory']) {
      const { matrix, row } = certifiedUiMatrix();
      row.ui.detectors.push({ ref: PROOF, enforcement });
      const verdict = classReport(matrix, row);
      assert.equal(verdict.status, 'RED');
      assert.ok(verdict.falseGreenRisks.includes(`${PROOF}:${enforcement}`));
    }
  });

  it('deliberate red: a blocking detector without deliberate red or with a red lane', () => {
    const { matrix, row } = certifiedUiMatrix();
    row.ui.detectors = [{ ref: PROOF, enforcement: 'merge-group-blocking' }];
    assert.equal(classReport(matrix, row).status, 'RED');
    const live = certifiedUiMatrix();
    live.row.ui.detectors[0].liveStatus = 'red';
    assert.ok(
      classReport(live.matrix, live.row).falseGreenRisks.includes(
        `${PROOF}:live-red`
      )
    );
  });

  it('deliberate red: stale or missing exact-build evidence', () => {
    const { matrix, row } = certifiedUiMatrix();
    row.ui.exactBuildEvidence[0].observedAt = '2020-01-01T00:00:00Z';
    const verdict = classReport(matrix, row);
    assert.equal(verdict.status, 'RED');
    assert.deepEqual(verdict.missingEvidence, [row.ui.requiredEvidence[0]]);
  });

  it('deliberate red: an uncaught escape keeps its class RED', () => {
    const { matrix, row } = certifiedUiMatrix();
    const entry = matrix.uiEscapeCorpus.find(item => item.row === row.id);
    entry.caught = false;
    const verdict = classReport(matrix, row);
    assert.equal(verdict.status, 'RED');
    assert.ok(verdict.uncaughtEscapes.includes(entry.id));
  });

  it('deliberate red: invalid UI inventory, detectors and corpus are rejected', () => {
    const matrix = healthy();
    const inventory = matrix.scope.requiredObjects.find(
      item => item.kind === 'ui-inventory'
    );
    inventory.source = inventory.source.replace(/#.*/, '#NOT_AN_EXPORT');
    const row = matrix.rows.find(item => item.ui);
    row.ui.detectors[0].ref = 'apps/web/does-not-exist.test.ts';
    matrix.uiEscapeCorpus[0].caught = true;
    delete matrix.uiEscapeCorpus[0].fixture;
    matrix.rows.push({ ...clone(row), id: 'AM-999' });
    const errors = validateAssuranceMatrix(matrix);
    for (const expected of [
      `ui-inventory:${inventory.id}:export-missing:NOT_AN_EXPORT`,
      `ui:${row.id}:detector:apps/web/does-not-exist.test.ts:ref-missing`,
      `ui-escape:${matrix.uiEscapeCorpus[0].id}:caught-requires-fixture`,
      `ui:class:${row.failureClass}:duplicate-row`,
    ])
      assert.ok(
        errors.includes(expected),
        `expected ${expected}, got ${errors.join('; ')}`
      );
  });
});
