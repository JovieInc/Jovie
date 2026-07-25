import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InlineConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import storybookConfig from '../../../.storybook/main';

/**
 * Deterministic contract test for apps/web/.storybook/main.ts.
 *
 * Regression guard for merge_group run 30127155907: Storybook's FINAL Vite
 * transpile (run via `build-storybook`) fell back to Vite's default browser
 * target (es2020) because viteFinal set `esbuild.target` and
 * `optimizeDeps.esbuildOptions.target` to 'esnext' but never set
 * `build.target`. es2020 hard-fails on object rest/destructuring emitted by
 * Storybook 10 + modern Next packages, breaking the preview build in the
 * merge queue.
 *
 * It also guards a second failure mode from the same run: an addon
 * (`@storybook/addon-mcp`) was listed in `addons` but never installed in
 * apps/web/package.json, so Storybook could not resolve it at build time.
 *
 * Pure and offline by design: it imports the config module and invokes
 * `viteFinal` on a minimal input config — no real browser, no network, and
 * no full Storybook build — so it stays deterministic in CI.
 */

const testDir = dirname(fileURLToPath(import.meta.url));
// tests/unit/storybook -> tests/unit -> tests -> apps/web
const webAppDir = resolve(testDir, '..', '..', '..');

type Addon = string | { name?: string };

function addonName(addon: Addon): string {
  return typeof addon === 'string' ? addon : (addon?.name ?? '');
}

function readWebPackageJson(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  const pkgPath = resolve(webAppDir, 'package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf8'));
}

async function runViteFinal(): Promise<InlineConfig> {
  const viteFinal = storybookConfig.viteFinal;
  if (typeof viteFinal !== 'function') {
    throw new Error('.storybook/main.ts must export a viteFinal function');
  }
  // Storybook passes (config, options); main.ts only reads `config`. Start
  // from an empty config so assertions reflect exactly what viteFinal sets.
  const result = await viteFinal({} as InlineConfig, {} as never);
  return result as InlineConfig;
}

function esbuildTarget(config: InlineConfig): string | undefined {
  return (config.esbuild as { target?: string } | undefined)?.target;
}

describe('storybook vite build config contract', () => {
  it('pins the final build transpile target to esnext', async () => {
    const config = await runViteFinal();

    // Without this, build-storybook falls back to the es2020 browser default.
    expect(config.build?.target).toBe('esnext');
  });

  it('keeps dev prebundling targets aligned with build', async () => {
    const config = await runViteFinal();

    // The three targets must agree; a drift caused run 30127155907.
    expect(esbuildTarget(config)).toBe('esnext');
    expect(config.optimizeDeps?.esbuildOptions?.target).toBe('esnext');
    expect(config.build?.target).toBe('esnext');
  });

  it('preserves the use-client rollup onwarn filter', async () => {
    const config = await runViteFinal();

    // Setting build.target must not clobber the existing rollupOptions that
    // silence MODULE_LEVEL_DIRECTIVE ("use client") build noise.
    const onwarn = config.build?.rollupOptions?.onwarn;
    expect(typeof onwarn).toBe('function');

    const suppressed: unknown[] = [];
    const warn = (w: unknown) => suppressed.push(w);
    (onwarn as (warning: unknown, warn: (w: unknown) => void) => void)(
      { code: 'MODULE_LEVEL_DIRECTIVE', message: 'directive "use client"' },
      warn
    );
    expect(suppressed).toHaveLength(0);
  });

  it('does not configure the uninstalled @storybook/addon-mcp', () => {
    const addons = (storybookConfig.addons ?? []) as Addon[];
    const names = addons.map(addonName);
    expect(names).not.toContain('@storybook/addon-mcp');

    const pkg = readWebPackageJson();
    const installed = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    expect('@storybook/addon-mcp' in installed).toBe(false);
  });

  it('only configures addons installed in apps/web/package.json', () => {
    // General guard for the whole class: any npm-package addon listed in
    // `addons` must be a declared dependency, or Storybook cannot resolve it
    // at build time (the exact failure @storybook/addon-mcp caused).
    const pkg = readWebPackageJson();
    const installed = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    const addons = (storybookConfig.addons ?? []) as Addon[];
    const packageAddons = addons
      .map(addonName)
      .filter(
        name =>
          name.startsWith('@storybook/') || name.startsWith('@chromatic-com/')
      );

    // Sanity: we still ship the core a11y addon.
    expect(packageAddons).toContain('@storybook/addon-a11y');

    const missing = packageAddons.filter(name => !installed.has(name));
    expect(missing).toEqual([]);
  });
});
