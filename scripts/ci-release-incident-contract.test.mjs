import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  REQUIRED_INCIDENT_IDS,
  validateIncidentLedger,
  validateMergeQueueBackendLabels,
} from './ci-release-incident-contract.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-incident-contract-'));
  for (const path of ['regression.mjs', 'operator.md', 'postmortem.md']) {
    writeFileSync(join(root, path), 'fixture\n');
  }
  const incidents = REQUIRED_INCIDENT_IDS.map(id => ({
    id,
    failureMode: 'fixture failure mode',
    regression: {
      kind: 'verifier',
      command: 'node regression.mjs',
      path: 'regression.mjs',
    },
    ciStageOwner: { stage: 'source-pr', owner: 'CI' },
    documentation: { operator: 'operator.md', postmortem: 'postmortem.md' },
    templatePropagation: {
      repository: 'JovieInc/ci',
      template: 'templates/jovie-ci-release-prevention',
      bootstrap: 'templates/jovie-ci-release-prevention/bootstrap.mjs',
      templateVersion: 'bc0b0676c058ffa1c8515e8c29fefd2317b160cc',
      workflow:
        '.github/workflows/verify-ci-release-prevention.yml@bc0b0676c058ffa1c8515e8c29fefd2317b160cc',
      manifest: 'ci-release-prevention.yml',
      requiredFields: [
        'template',
        'template_version',
        'ledger',
        'verifier',
        'scaffold_proof',
      ],
    },
    scaffoldProof: {
      repository: 'JovieInc/ci',
      path: 'scripts/test-jovie-ci-template-scaffold.mjs',
      command: 'node scripts/test-jovie-ci-template-scaffold.mjs',
    },
  }));
  writeFileSync(join(root, 'operator.md'), REQUIRED_INCIDENT_IDS.join('\n'));
  writeFileSync(join(root, 'postmortem.md'), 'CI_RELEASE_INCIDENTS.md\n');
  return {
    root,
    ledger: {
      schemaVersion: 1,
      mergeQueueLabelPolicy: {
        nativeForbidsLegacyLabel: true,
        graphiteExplicitlyAllowsLegacyLabel: true,
      },
      incidents,
    },
  };
}

test('accepts every registered incident with existing prevention evidence', () => {
  const { root, ledger } = fixture();
  const cwd = process.cwd();
  process.chdir(root);
  try {
    assert.deepEqual(validateIncidentLedger(ledger), { ok: true, errors: [] });
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects legacy labels for native queue while permitting explicit Graphite backend', () => {
  assert.deepEqual(validateMergeQueueBackendLabels('native', ['merge-queue']), [
    'native merge queue must reject legacy merge-queue labels',
  ]);
  assert.deepEqual(validateMergeQueueBackendLabels('native', []), []);
  assert.deepEqual(
    validateMergeQueueBackendLabels('graphite', ['merge-queue']),
    []
  );
});

test('fails closed when an incident lacks propagation or a regression path', () => {
  const { root, ledger } = fixture();
  const cwd = process.cwd();
  process.chdir(root);
  try {
    delete ledger.incidents[0].templatePropagation.bootstrap;
    ledger.incidents[1].scaffoldProof.command = 'node missing.mjs';
    const result = validateIncidentLedger(ledger);
    assert.equal(result.ok, false);
    assert.match(
      result.errors.join('\n'),
      /templatePropagation\.bootstrap must equal/
    );
    assert.match(result.errors.join('\n'), /scaffoldProof\.command must equal/);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
