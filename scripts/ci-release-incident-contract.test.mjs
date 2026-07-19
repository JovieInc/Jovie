import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_INCIDENT_IDS,
  validateIncidentLedger,
} from './ci-release-incident-contract.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-incident-contract-'));
  for (const path of ['regression.mjs', 'operator.md', 'postmortem.md', 'template.json', 'scaffold.mjs']) {
    writeFileSync(join(root, path), 'fixture\n');
  }
  const incidents = REQUIRED_INCIDENT_IDS.map(id => ({
    id,
    failureMode: 'fixture failure mode',
    regression: { kind: 'verifier', command: 'node regression.mjs', path: 'regression.mjs' },
    ciStageOwner: { stage: 'source-pr', owner: 'CI' },
    documentation: { operator: 'operator.md', postmortem: 'postmortem.md' },
    templatePropagation: { source: 'JovieInc/ci', path: 'template.json' },
    scaffoldProof: { command: 'node scaffold.mjs', path: 'scaffold.mjs' },
  }));
  return { root, ledger: { schemaVersion: 1, incidents } };
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

test('fails closed when an incident lacks propagation or a regression path', () => {
  const { root, ledger } = fixture();
  const cwd = process.cwd();
  process.chdir(root);
  try {
    delete ledger.incidents[0].templatePropagation.path;
    ledger.incidents[1].regression.path = 'missing.mjs';
    const result = validateIncidentLedger(ledger);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /templatePropagation\.path must be a repository-relative path/);
    assert.match(result.errors.join('\n'), /regression\.path does not exist: missing\.mjs/);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
