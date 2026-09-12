import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildBaseline,
  evaluateNativeSpacingScale,
  measureNativeSpacingScale,
  readBaseline,
  runNativeSpacingScale,
  scanCssSource,
  scanSwiftSource,
  tierOf,
} from './native-spacing-scale.mjs';

describe('native spacing-scale detector (JOV-5865)', () => {
  it('tiers literals against the 4px grid', () => {
    assert.equal(tierOf(0), null);
    assert.equal(tierOf(1), null);
    assert.equal(tierOf(2), null);
    assert.equal(tierOf(4), null);
    assert.equal(tierOf(12), null);
    assert.equal(tierOf(32), null);
    assert.equal(tierOf(3), 'strict');
    assert.equal(tierOf(6), 'strict');
    assert.equal(tierOf(10), 'conservative');
    assert.equal(tierOf(13), 'conservative');
    assert.equal(tierOf(14), 'conservative');
    assert.equal(tierOf(18), 'conservative');
    assert.equal(tierOf(-10), 'conservative');
    assert.equal(tierOf(-4), null);
    assert.equal(tierOf(-3), 'strict');
  });

  it('reads Swift padding and stack spacing literals', () => {
    const source = [
      'VStack(alignment: .leading, spacing: 10) {',
      '  Text("x").padding(.vertical, 13).padding(8)',
      '  HStack(spacing: 4) {}',
      '}',
      '.padding(.horizontal, JovieTheme.space3)',
      '.padding(-10).padding(.vertical, -14)',
    ].join('\n');
    assert.deepEqual(scanSwiftSource(source), [10, 13, 8, 4, -10, -14]);
  });

  it('reads px literals from inline CSS spacing declarations only', () => {
    const css =
      '.a{display:grid;gap:10px;padding:0 13px;height:34px;font-size:12px}' +
      '.b { margin: 4px 8px; padding-inline: 16px; border-radius: 10px; }';
    // Unitless `0` carries no px unit and is skipped; sizes/radius are ignored.
    assert.deepEqual(scanCssSource(css), [10, 13, 4, 8, 16]);
  });

  it('fails on conservative growth and only warns on strict growth', () => {
    const baseline = {
      surfaces: {
        ios: { conservative: 2, strict: 5, files: 2 },
        desktop: { conservative: 1, strict: 1, files: 1 },
      },
    };
    const grew = evaluateNativeSpacingScale({
      measured: {
        ios: { conservative: 3, strict: 6, files: 2, perFile: {} },
        desktop: { conservative: 1, strict: 1, files: 1, perFile: {} },
      },
      baseline,
    });
    assert.equal(grew.ok, false);
    assert.equal(grew.issues.length, 1);
    assert.match(grew.issues[0], /ios: .* 3 > baseline 2/);

    const strictOnly = evaluateNativeSpacingScale({
      measured: {
        ios: { conservative: 2, strict: 6, files: 2, perFile: {} },
        desktop: { conservative: 1, strict: 1, files: 1, perFile: {} },
      },
      baseline,
    });
    assert.equal(strictOnly.ok, true);
    assert.equal(strictOnly.warnings.length, 1);
  });

  it('requires source reductions to lower the floor, allows sibling merge-group shrink, and rejects regrowth', () => {
    const measured = { ios: { conservative: 10, strict: 12, files: 1 } };
    const baseline = {
      surfaces: { ios: { conservative: 12, strict: 12, files: 1 } },
    };
    for (const event of ['local', 'pull_request']) {
      const verdict = evaluateNativeSpacingScale({ measured, baseline, event });
      assert.equal(verdict.ok, false);
      assert.match(verdict.issues[0], /lower the baseline to 10/);
    }
    assert.equal(
      evaluateNativeSpacingScale({ measured, baseline, event: 'merge_group' })
        .ok,
      true
    );
    baseline.surfaces.ios.conservative = 10;
    assert.equal(
      evaluateNativeSpacingScale({ measured, baseline, event: 'pull_request' })
        .ok,
      true
    );
    measured.ios.conservative = 12;
    for (const event of ['local', 'pull_request', 'merge_group']) {
      assert.equal(
        evaluateNativeSpacingScale({ measured, baseline, event }).ok,
        false
      );
    }
  });

  it('exercises real scanning, explicit baseline generation, reporting, and failure paths in an isolated tree', t => {
    const root = mkdtempSync(join(tmpdir(), 'native-spacing-contract-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const ios = join(root, 'apps/ios/Jovie');
    const desktop = join(root, 'apps/desktop/src');
    const baselinePath = join(
      root,
      'scripts/invariants/native-spacing-scale.baseline.json'
    );
    mkdirSync(ios, { recursive: true });
    mkdirSync(desktop, { recursive: true });
    mkdirSync(join(root, 'scripts/invariants'), { recursive: true });
    mkdirSync(join(ios, 'build'));
    writeFileSync(join(ios, 'build/Ignored.swift'), '.padding(13)');
    writeFileSync(join(ios, 'IgnoredTests.swift'), '.padding(13)');
    writeFileSync(join(ios, 'Notes.md'), '.padding(13)');
    writeFileSync(join(ios, 'View.swift'), '.padding(10)');
    writeFileSync(
      join(desktop, 'View.ts'),
      'const css = "gap: 6px; margin: -4px";'
    );
    let stdout = '';
    let stderr = '';
    const output = {
      stdout: {
        write: value => {
          stdout += value;
        },
      },
      stderr: {
        write: value => {
          stderr += value;
        },
      },
    };
    assert.equal(readBaseline(root), null);
    assert.equal(runNativeSpacingScale(['--json'], root, output), 1);
    assert.equal(JSON.parse(stdout).verdict.issues.length, 2);
    stdout = '';
    assert.equal(
      runNativeSpacingScale(['--write-baseline', '--json'], root, output),
      0
    );
    const generated = readBaseline(root);
    assert.equal(generated.surfaces.ios.conservative, 1);
    assert.equal(generated.surfaces.ios.files, 1);
    assert.equal(generated.surfaces.desktop.conservative, 0);
    assert.equal(generated.surfaces.desktop.strict, 1);
    assert.equal(JSON.parse(stdout).verdict.ok, true);
    generated.surfaces.desktop.strict = 0;
    writeFileSync(baselinePath, JSON.stringify(generated));
    stdout = '';
    assert.equal(runNativeSpacingScale([], root, output), 0);
    assert.match(stdout, /strict off-grid literals grew/);
    assert.match(stdout, /PASS/);
    generated.surfaces.ios.conservative = 0;
    writeFileSync(baselinePath, JSON.stringify(generated));
    stdout = '';
    assert.equal(runNativeSpacingScale([], root, output), 1);
    assert.match(stderr, /ios: .* grew/);
    assert.match(stdout, /FAIL/);
    writeFileSync(baselinePath, '{invalid');
    assert.throws(() => runNativeSpacingScale([], root, output), SyntaxError);
    assert.deepEqual(measureNativeSpacingScale(join(root, 'absent')).ios, {
      conservative: 0,
      strict: 0,
      files: 0,
      perFile: {},
    });
  });

  it('holds the checked-in baseline against the live repo (shrink-only)', () => {
    const baseline = readBaseline();
    assert.ok(baseline, 'native-spacing-scale.baseline.json must exist');
    assert.deepEqual(baseline.armed, { conservative: true, strict: false });
    const measured = measureNativeSpacingScale();
    const verdict = evaluateNativeSpacingScale({ measured, baseline });
    assert.deepEqual(verdict.issues, []);
    for (const [surface, result] of Object.entries(measured)) {
      assert.ok(
        result.conservative <= baseline.surfaces[surface].conservative,
        `${surface} conservative must not grow`
      );
    }
    // buildBaseline stays shape-compatible with the checked-in file.
    assert.deepEqual(
      Object.keys(buildBaseline(measured).surfaces).sort(),
      Object.keys(baseline.surfaces).sort()
    );
  });
});
