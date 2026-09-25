import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { findSummerDeploymentPins } from './summer-deployment-pin-guard.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'summer-pin-guard-'));
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

describe('summer deployment pin guard', () => {
  it('rejects a per-deployment Summer URL and a long deployment id', () => {
    const host = ['jovie-eve-shadow', 'abc123', 'jovie.vercel.app'].join('-');
    const deploymentId = `dpl_${'A'.repeat(24)}`;
    const root = fixture({
      'docs/note.md': `Call https://${host} for Summer.`,
      'apps/web/lib/ovie/summer-note.ts': `const pin = '${deploymentId}'; // summer.jov.ie`,
      'docs/other.md': `Jovie deployment ${deploymentId} is unrelated.`,
    });
    const findings = findSummerDeploymentPins(root).map(
      finding => finding.reason
    );
    assert.deepEqual([...findings].sort(), [
      'Summer deployment id literal',
      'per-deployment Summer URL',
    ]);
  });

  it('allows a historical incident line and the stable domain', () => {
    const deploymentId = `dpl_${'B'.repeat(24)}`;
    const root = fixture({
      'docs/history.md': `${deploymentId} <!-- summer-pin-historical: cutover receipt --> summer.jov.ie`,
      'apps/web/lib/ovie/summer-origin.ts':
        "export const origin = 'https://summer.jov.ie';\n",
    });
    assert.deepEqual(findSummerDeploymentPins(root), []);
  });

  it('finds no Summer deployment pin in this repository', () => {
    assert.deepEqual(findSummerDeploymentPins(repoRoot), []);
  });
});
