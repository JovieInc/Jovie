import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
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

const TEXT_TOKEN_PAIRS = [
  ['--linear-text-primary', '--color-text-primary-token'],
  ['--linear-text-secondary', '--color-text-secondary-token'],
  ['--linear-text-tertiary', '--color-text-tertiary-token'],
  ['--linear-text-quaternary', '--color-text-quaternary-token'],
] as const;

function customPropertiesForSelector(
  css: string,
  selector: ':root' | ':root.dark'
): Map<string, string> {
  const properties = new Map<string, string>();
  const root = postcss.parse(css);

  for (const node of root.nodes) {
    if (node.type !== 'rule' || !node.selectors.includes(selector)) continue;
    for (const child of node.nodes) {
      if (child.type === 'decl' && child.prop.startsWith('--')) {
        properties.set(child.prop, child.value.trim());
      }
    }
  }

  return properties;
}

function resolveCustomProperty(
  property: string,
  properties: Map<string, string>,
  seen = new Set<string>()
): string {
  const value = properties.get(property);
  if (!value) throw new Error(`Missing custom property: ${property}`);
  if (seen.has(property))
    throw new Error(`Circular custom property: ${property}`);

  const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!alias) return value.replace(/\s+/g, ' ');

  const nextSeen = new Set(seen);
  nextSeen.add(property);
  return resolveCustomProperty(alias[1], properties, nextSeen);
}

function textTokenMismatches(
  linearProperties: Map<string, string>,
  canonicalProperties: Map<string, string>
): string[] {
  return TEXT_TOKEN_PAIRS.flatMap(([linear, canonical]) =>
    resolveCustomProperty(linear, linearProperties) ===
    resolveCustomProperty(canonical, canonicalProperties)
      ? []
      : [`${linear} -> ${canonical}`]
  );
}

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

  it('owns radius CSS and leaves Tailwind no legacy linear radius namespace', () => {
    const tokens = loadSource() as {
      radius: Record<string, string>;
    };
    const generated = readFileSync(
      join(WEB_ROOT, 'styles', 'generated', 'design-tokens.css'),
      'utf8'
    );
    const designSystem = readFileSync(
      join(WEB_ROOT, 'styles', 'design-system.css'),
      'utf8'
    );
    const linearTokens = readFileSync(
      join(WEB_ROOT, 'styles', 'linear-tokens.css'),
      'utf8'
    );
    const tailwindConfig = readFileSync(
      join(WEB_ROOT, 'tailwind.config.js'),
      'utf8'
    );

    for (const [name, value] of Object.entries(tokens.radius)) {
      if (name.startsWith('$')) continue;
      expect(generated).toContain(`--radius-${name}: ${value};`);
    }

    expect(designSystem).not.toMatch(/^\s*--radius-[a-z0-9-]+:/m);
    expect(linearTokens).not.toMatch(/--linear-radius-[a-z0-9-]+/);
    expect(tailwindConfig).not.toMatch(/'linear-(?:sm|md|lg)'/);

    const tailwindRadiusTokens = [
      ...tailwindConfig.matchAll(/var\(--radius-([a-z0-9-]+)\)/g),
    ].map(match => match[1]);
    expect(tailwindRadiusTokens.length).toBeGreaterThan(0);
    for (const name of tailwindRadiusTokens) {
      expect(tokens.radius).toHaveProperty(name);
    }
  });

  it('keeps zero-consumer linear text semantic aliases retired', () => {
    const linearTokens = readFileSync(
      join(WEB_ROOT, 'styles', 'linear-tokens.css'),
      'utf8'
    );

    expect(linearTokens).not.toMatch(
      /--linear-color-text(?:-muted|-subtle)?\s*:/
    );
  });

  it('deliberate-red: keeps light-mode linear text declarations unequal until redesign', () => {
    const linearTokens = readFileSync(
      join(WEB_ROOT, 'styles', 'linear-tokens.css'),
      'utf8'
    );
    const designSystem = readFileSync(
      join(WEB_ROOT, 'styles', 'design-system.css'),
      'utf8'
    );

    expect(
      textTokenMismatches(
        customPropertiesForSelector(linearTokens, ':root'),
        customPropertiesForSelector(designSystem, ':root')
      )
    ).toEqual(
      TEXT_TOKEN_PAIRS.map(([linear, canonical]) => `${linear} -> ${canonical}`)
    );
  });

  it('keeps dark-mode linear and canonical text declarations identical after alias resolution', () => {
    const linearTokens = readFileSync(
      join(WEB_ROOT, 'styles', 'linear-tokens.css'),
      'utf8'
    );
    const designSystem = readFileSync(
      join(WEB_ROOT, 'styles', 'design-system.css'),
      'utf8'
    );

    expect(
      textTokenMismatches(
        customPropertiesForSelector(linearTokens, ':root.dark'),
        customPropertiesForSelector(designSystem, ':root.dark')
      )
    ).toEqual([]);
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
