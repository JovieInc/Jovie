import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { CRITERIA, certifyComponent } from '../component-certificate.mjs';

const criterion = (cert, id) => cert.criteria.find(row => row.id === id);
const sourceGuardIds = ['ds-owner', 'tokens', 'frontend-rules'];
const clean = 'export function Card() { return <div />; }\n';

describe('component certificate discovery and source reuse', () => {
  it('all source guards inspect current bytes when a path is certified repeatedly', () => {
    const path = 'apps/web/components/molecules/Card.tsx';
    const inspect = source => certifyComponent({ path, source });
    const failingSource =
      'export const Card = () => <button className="bg-blue-500" autoFocus />;';
    const failing = inspect(failingSource);
    for (const id of sourceGuardIds) {
      assert.equal(criterion(failing, id).status, 'fail');
      assert.ok(failing.missing.some(row => row.criterion === id));
    }
    assert.equal(failing.certified, false);
    assert.deepEqual(criterion(failing, 'tokens').samples, [
      { kind: 'tailwind-palette', value: 'bg-blue-500' },
    ]);
    assert.deepEqual(criterion(failing, 'frontend-rules').findings, [
      {
        rule: 'focus-loss:autofocus',
        line: 1,
        detail:
          'autoFocus steals focus on mount; move focus on an explicit user action',
      },
    ]);
    const passing = inspect(clean);
    for (const id of sourceGuardIds) {
      assert.equal(criterion(passing, id).status, 'pass');
      assert.ok(!passing.missing.some(row => row.criterion === id));
    }
    assert.notEqual(passing.binding, failing.binding);
    assert.deepEqual(inspect(failingSource), failing);
  });

  it('whole-tree discovery retains every coverage root once and its canonical order', () => {
    const root = mkdtempSync(join(tmpdir(), 'component-cert-discovery-'));
    try {
      const component = 'apps/web/components/molecules/Card.tsx';
      const components = [
        'packages/ui/atoms/Primitive.tsx',
        'packages/ui/Surface.tsx',
        'apps/web/components/atoms/Badge.tsx',
        component,
        'apps/web/components/features/Feature.tsx',
      ];
      for (const path of [
        ...components,
        'packages/ui/hooks/NotATopLevelComponent.tsx',
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), clean);
      }
      const output = join(root, 'all.json');
      const cli = fileURLToPath(
        new URL('../../component-certificate.mjs', import.meta.url)
      );
      const result = spawnSync(
        process.execPath,
        [
          cli,
          '--repo-root',
          root,
          '--all',
          '--component',
          component,
          '--component',
          component,
          '--out',
          output,
        ],
        { cwd: root, encoding: 'utf8' }
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      assert.deepEqual(
        report.certificates.map(c => c.component),
        components
      );
      assert.equal(report.totals.components, components.length);
      for (const cert of report.certificates)
        assert.deepEqual(
          cert.criteria.map(row => row.id),
          CRITERIA
        );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
