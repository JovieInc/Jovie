import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { readInvariantRegistry } from './registry.mjs';
import {
  SONAR_REPAIR_INVARIANT_ID,
  SONAR_REPAIR_SCHEMA,
  validateSonarRepairContract,
  validateSonarRepairSources,
} from './sonar-repair-contract.mjs';

function fixture({ command, workflow, properties }) {
  const root = mkdtempSync(join(tmpdir(), 'sonar-repair-contract-'));
  mkdirSync(join(root, '.claude/commands'), { recursive: true });
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(join(root, '.claude/commands/sonar-fix.md'), command);
  writeFileSync(join(root, '.github/workflows/sonarcloud.yml'), workflow);
  writeFileSync(join(root, '.sonarcloud.properties'), properties);
  writeFileSync(join(root, 'sonar-project.properties'), properties);
  return root;
}

describe('JOV-INV-036 Sonar repair contract', () => {
  it('accepts the checked-in Sonar prevention path', () => {
    assert.deepEqual(validateSonarRepairContract(), []);
    const invariant = readInvariantRegistry().invariants.find(
      item => item.id === SONAR_REPAIR_INVARIANT_ID
    );
    assert.ok(invariant);
    assert.equal(invariant.policy.value.schema, SONAR_REPAIR_SCHEMA);
  });

  it('deliberate red: rejects stale develop and success-before-scan guidance', () => {
    const errors = validateSonarRepairSources(
      fixture({
        command:
          'git checkout develop\nDo NOT wait for CI\nAll SonarCloud issues resolved!',
        workflow: 'run: echo skipped',
        properties:
          'sonar.sources=apps/web/app\nsonar.exclusions=\\\n  apps/web/app/**\n\n',
      })
    );
    assert.ok(errors.some(error => error.includes('git checkout develop')));
    assert.ok(errors.some(error => error.includes('without a scan')));
  });

  it('deliberate red: rejects product-wide test exclusions', () => {
    const errors = validateSonarRepairSources(
      fixture({
        command: '',
        workflow:
          'echo "SONAR_TOKEN is not configured; SonarCloud analysis did not run." >&2\nexit 1',
        properties:
          'sonar.sources=apps/web/app,apps/web/lib\nsonar.exclusions=\\\n  apps/web/lib/**,\\\n  **/*.a11y-red.tsx\n\n',
      })
    );
    assert.ok(
      errors.some(error => error.includes('apps/web/lib/**')),
      errors.join('\n')
    );
    assert.ok(
      errors.some(error => error.includes('not bound to one fixture file')),
      errors.join('\n')
    );
  });

  it('rejects an unrelated failure that leaves missing scans green', () => {
    const errors = validateSonarRepairSources(
      fixture({
        command: '',
        workflow: 'run: exit 1\nrun: echo "scan skipped"',
        properties: 'sonar.sources=apps/web/app\nsonar.exclusions=\\\n\n',
      })
    );
    assert.ok(errors.some(error => error.includes('without a scan')));
  });
});
