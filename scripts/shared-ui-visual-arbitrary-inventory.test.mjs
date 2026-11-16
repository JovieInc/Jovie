import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { selectDesignConformanceChecks } from './design-conformance-paths.mjs';
import {
  evaluateSharedUiVisualArbitraryAudit,
  isSharedUiProductionSource,
  REPO_ROOT,
  scanSharedUiVisualArbitrary,
  toVisualArbitraryBaseline,
} from './shared-ui-visual-arbitrary-audit.mjs';

test('inventory test edits select design conformance', () => {
  const file = 'scripts/shared-ui-visual-arbitrary-inventory.test.mjs';
  const selection = selectDesignConformanceChecks([file]);
  assert.equal(selection.applicable, true);
  assert.deepEqual(selection.domains, ['governance']);
  assert.deepEqual(selection.selectedPaths, [file]);
});

test('scanner covers the exact tracked production inventory as sources change', () => {
  // A literal file count needs repair after every clean source addition and
  // cannot detect a missing source replaced by an unexpected one.
  const productionFiles = execFileSync(
    'git',
    ['ls-files', '-z', '--', 'packages/ui'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )
    .split('\0')
    .filter(isSharedUiProductionSource)
    .sort((left, right) => left.localeCompare(right));
  const measured = scanSharedUiVisualArbitrary();
  assert.deepEqual(measured.scannedFiles, productionFiles);
  assert.ok(
    measured.scannedFiles.includes('packages/ui/atoms/plain-button.tsx')
  );
});

test('new production sources enter the audit and cannot add visual debt', () => {
  const root = mkdtempSync(join(tmpdir(), 'shared-ui-visual-addition-'));
  try {
    mkdirSync(join(root, 'packages/ui/atoms'), { recursive: true });
    const options = {
      repoRoot: root,
      baseline: toVisualArbitraryBaseline([]),
      eventName: 'local',
    };
    const before = evaluateSharedUiVisualArbitraryAudit(options);
    assert.equal(before.ok, true);
    assert.deepEqual(before.scannedFiles, []);

    const source = 'packages/ui/atoms/new-control.tsx';
    writeFileSync(join(root, source), 'export const style = "rounded-md";\n');
    const clean = evaluateSharedUiVisualArbitraryAudit(options);
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.scannedFiles, [source]);
    assert.equal(clean.totalFindings, 0);

    writeFileSync(
      join(root, source),
      'export const style = "rounded-[12px]";\n'
    );
    const red = evaluateSharedUiVisualArbitraryAudit(options);
    assert.equal(red.ok, false);
    assert.equal(red.status, 'regression');
    assert.deepEqual(red.scannedFiles, [source]);
    assert.deepEqual(red.findings, [
      { file: source, value: 'rounded-[12px]', count: 1 },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
