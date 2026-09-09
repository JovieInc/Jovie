import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildBaseline,
  evaluateNativeSpacingScale,
  measureNativeSpacingScale,
  readBaseline,
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
  });

  it('reads Swift padding and stack spacing literals', () => {
    const source = [
      'VStack(alignment: .leading, spacing: 10) {',
      '  Text("x").padding(.vertical, 13).padding(8)',
      '  HStack(spacing: 4) {}',
      '}',
      '.padding(.horizontal, JovieTheme.space3)',
    ].join('\n');
    assert.deepEqual(scanSwiftSource(source), [10, 13, 8, 4]);
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
        desktop: { conservative: 0, strict: 1, files: 1, perFile: {} },
      },
      baseline,
    });
    assert.equal(strictOnly.ok, true);
    assert.equal(strictOnly.warnings.length, 1);
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
