import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  contrastRatioOklch,
  formatOklch,
  hexToOklch,
  interpolateOklch,
  isInSrgbGamut,
  isMonotonicLightness,
  parseOklch,
} from './lib/oklch.mjs';
import {
  COLOR_SOT_PATH,
  COLOR_SOT_SCHEMA,
  PALETTE_PATH,
  REPO_ROOT,
  runOklchPaletteGuard,
  SCHEMA,
  validateOklchPalette,
} from './oklch-palette-guard.mjs';

const loadPalette = () =>
  JSON.parse(readFileSync(join(REPO_ROOT, PALETTE_PATH), 'utf8'));

test('canonical registry locks Mint/Orange/Red and surface-0..3', () => {
  const palette = loadPalette();
  const colorSot = JSON.parse(
    readFileSync(join(REPO_ROOT, COLOR_SOT_PATH), 'utf8')
  );
  assert.equal(palette.schema, SCHEMA);
  assert.equal(colorSot.schema, COLOR_SOT_SCHEMA);
  assert.equal(colorSot.penNode, 'ZiaWI');
  assert.equal(colorSot.accents.hex.ion, '#11AFFF');
  assert.equal(colorSot.elevations.count, 5);
  assert.equal(palette.authority, COLOR_SOT_SCHEMA);
  assert.equal(palette.colorSot.penNode, 'ZiaWI');
  assert.deepEqual(palette.semantics, {
    success: 'mint',
    warning: 'orange',
    danger: 'red',
  });
  assert.deepEqual(palette.elevation.tokens, [
    'surface-0',
    'surface-1',
    'surface-2',
    'surface-3',
  ]);
  assert.equal(palette.energyBands.policy.equalLightnessTarget, false);
  assert.equal(palette.energyBands.policy.pastelChromaCap, false);
  assert.deepEqual(runOklchPaletteGuard(), []);
});

test('OKLCH syntax, gamut, contrast, and monotonic interpolation', () => {
  assert.throws(() => parseOklch('#39e58c'), /Invalid OKLCH/);
  const mint = parseOklch('oklch(81.65% 0.1857 155.04)');
  const orange = parseOklch('oklch(86.15% 0.1423 82.66)');
  const red = parseOklch('oklch(71.03% 0.1852 14.41)');
  assert.equal(
    isInSrgbGamut(mint) && isInSrgbGamut(orange) && isInSrgbGamut(red),
    true
  );
  assert.ok(
    Math.max(mint.l, orange.l, red.l) - Math.min(mint.l, orange.l, red.l) > 0.08
  );
  const steps = [0, 0.33, 0.66, 1].map(t =>
    interpolateOklch(hexToOklch('#06080D'), hexToOklch('#1B2436'), t)
  );
  assert.equal(isMonotonicLightness(steps), true);
  assert.equal(formatOklch(steps[0]).startsWith('oklch('), true);
  assert.ok(
    contrastRatioOklch(hexToOklch('#F5F7FB'), hexToOklch('#06080D')) >= 4.5
  );
});

test('guard rejects rogue stops, freehand derived colors, and off-token copy', () => {
  const palette = loadPalette();
  const stopCodes = validateOklchPalette({
    ...palette,
    gradients: [
      {
        id: 'broken',
        kind: 'equal-step',
        endpoints: ['mint', 'orange'],
        stops: [
          { token: 'orange', at: 1 },
          { token: 'mint', at: 0 },
        ],
      },
    ],
  }).map(i => i.code);
  assert.ok(stopCodes.includes('gradient-stops'));
  const derivedCodes = validateOklchPalette({
    ...palette,
    derived: [{ id: 'rogue', kind: 'freehand', from: 'mint', to: 'red' }],
  }).map(i => i.code);
  assert.ok(derivedCodes.includes('derived-kind'));
  const offCodes = validateOklchPalette(palette, REPO_ROOT, {
    css: ':root { --color-warning: #ff00aa; --color-success: var(--color-accent-green); }\n',
    tokensJson: { accent: { light: {}, dark: {} } },
    designMd:
      '| Gold | `#FFC857` | warning |\n| Flare | `#FF677D` | Danger |\n',
  }).map(i => i.code);
  assert.ok(offCodes.includes('off-token'));
  assert.ok(offCodes.includes('docs'));
});

test('React palette hexes must project ZiaWI; ion cannot drift to #1F7BF5', () => {
  const palette = loadPalette();
  const drifted = structuredClone(palette);
  drifted.swatches.ion.light.hex = '#1F7BF5';
  drifted.swatches.ion.dark.hex = '#1F7BF5';
  const codes = validateOklchPalette(drifted).map(i => i.code);
  assert.ok(codes.includes('color-sot'));
});
