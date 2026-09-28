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
    assert.equal(receipt.matrixRevision, '2026-09-27.1');
  });
});
