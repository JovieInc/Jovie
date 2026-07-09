import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkOutputs,
  generate,
  loadSource,
} from '../../../scripts/build-design-tokens.mjs';

/**
 * Single-token-source contract (JOV #12009 wave 1).
 *
 * 1. Generated outputs (CSS / TS / manifest) must be in sync with
 *    design/tokens.json — stale generated files fail CI.
 * 2. The gray scale must actually resolve app-wide: design-system.css must
 *    import the generated CSS that defines --gray1..12 (previously only
 *    defined in public/pitch/colors_and_type.css).
 * 3. No value divergence between the canonical source and the live emitter
 *    (design-system.css) for the accent palette — the source of truth and
 *    the shipped CSS may never disagree.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');

describe('design tokens — single machine-readable source', () => {
  it('generated outputs are in sync with design/tokens.json', () => {
    const stale = checkOutputs(generate(loadSource()));
    expect(
      stale,
      `Stale generated token outputs. Run: pnpm --filter @jovie/web run tokens:build`
    ).toEqual([]);
  });

  it('gray scale resolves: design-system.css imports the generated tokens', () => {
    const css = readFileSync(
      join(WEB_ROOT, 'styles', 'design-system.css'),
      'utf8'
    );
    expect(css).toContain('@import "./generated/design-tokens.css"');

    const generated = readFileSync(
      join(WEB_ROOT, 'styles', 'generated', 'design-tokens.css'),
      'utf8'
    );
    for (let step = 1; step <= 12; step++) {
      expect(generated, `--gray${step} must be defined`).toContain(
        `--gray${step}:`
      );
    }
  });

  it('accent values in tokens.json match the live design-system.css emitter', () => {
    const tokens = loadSource() as {
      accent: Record<'light' | 'dark', Record<string, string>>;
    };
    const css = readFileSync(
      join(WEB_ROOT, 'styles', 'design-system.css'),
      'utf8'
    );

    for (const mode of ['light', 'dark'] as const) {
      for (const [name, value] of Object.entries(tokens.accent[mode])) {
        if (name.startsWith('$')) continue;
        const declaration = `--color-accent-${name}: ${value};`;
        expect(
          css,
          `design-system.css must emit "${declaration}" (${mode}) — if the live value changed intentionally, update design/tokens.json in the same PR (single source of truth)`
        ).toContain(declaration);
      }
    }
  });
});
