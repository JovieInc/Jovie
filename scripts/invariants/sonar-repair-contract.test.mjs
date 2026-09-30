import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  for (const [name, setting] of [
    ['missing heap override', ''],
    ['original exhausted heap', 'sonar.javascript.node.maxspace=4096'],
    ['commented override', '# sonar.javascript.node.maxspace=8192'],
    ['invalid unit suffix', 'sonar.javascript.node.maxspace=8192MB'],
    [
      'later undersized override',
      'sonar.javascript.node.maxspace=8192\nsonar.javascript.node.maxspace=4096',
    ],
    ['unbounded runner allocation', 'sonar.javascript.node.maxspace=16384'],
    [
      'indented later override',
      'sonar.javascript.node.maxspace=8192\n sonar.javascript.node.maxspace=4096',
    ],
    [
      'colon later override',
      'sonar.javascript.node.maxspace=8192\nsonar.javascript.node.maxspace:4096',
    ],
    [
      'whitespace later override',
      'sonar.javascript.node.maxspace=8192\nsonar.javascript.node.maxspace 4096',
    ],
  ]) {
    it(`rejects ${name}`, () => {
      const readSource = path =>
        readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
      const properties = readSource('sonar-project.properties').replace(
        /^sonar\.javascript\.node\.maxspace=.*\n?/gm,
        ''
      );
      const errors = validateSonarRepairSources(
        fixture({
          command: readSource('.claude/commands/sonar-fix.md'),
          workflow: readSource('.github/workflows/sonarcloud.yml'),
          properties: `${properties}\n${setting}\n`,
        })
      );
      assert.deepEqual(errors, [
        'Sonar CI analyzer heap must use the configured 8192 MB budget',
      ]);
    });
  }

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

  it('rejects a scan that cannot recover from Automatic Analysis being on', () => {
    const errors = validateSonarRepairSources(
      fixture({
        command: '',
        workflow:
          'echo "SONAR_TOKEN is not configured; SonarCloud analysis did not run." >&2\nexit 1\nuses: SonarSource/sonarqube-scan-action',
        properties: 'sonar.sources=apps/web/app\nsonar.exclusions=\\\n\n',
      })
    );
    assert.ok(
      errors.some(error => error.includes('Automatic Analysis')),
      errors.join('\n')
    );
  });
});
