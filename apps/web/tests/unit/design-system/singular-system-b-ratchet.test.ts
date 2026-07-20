import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Singular design system ("one system, two languages") ratchet.
 *
 * Founder-directed 2026-06-18 (see DESIGN.md decision log + gbrain "design
 * system review" canon): Jovie is converging the whole app onto System B — one
 * token foundation, one palette, one core typeface (Inter). System A (the
 * cinematic marketing language) is being RETIRED, not maintained.
 *
 * This is the global, machine-checked guardrail for that convergence. Per-surface
 * forbidden-pattern checks live in the individual `*-system-b-style-guard` tests;
 * this file enforces the two app-wide invariants that must only get tighter:
 *
 *   1. DM Sans is retired — no live source loads it or reads its font var.
 *      (Inter is the sole body/UI face; Satoshi is the one approved display face.)
 *   2. `.linear-marketing` (the System A wrapper) is shrink-only — no NEW surface
 *      may adopt it, and migrated surfaces must drop out of the allowlist. When the
 *      allowlist reaches empty, System A is fully retired and the goal is met.
 *
 * Tests run with cwd = apps/web (Vitest project root).
 */

const WEB_ROOT = process.cwd();

const SKIP: RegExp[] = [
  /\/tests\//,
  /\/node_modules\//,
  /\/\.next\//,
  /\/\.turbo\//,
  // Self-contained pitch reference stylesheet: defines its own --font-dm-sans and
  // imports the Google webfont. Tracked for cleanup in the System A teardown phase.
  /\/public\/pitch\//,
  // Server-side OG-image Satori rendering is a build-time asset, not live page type.
  /opengraph-image\.tsx$/,
  /\/lib\/share\/image-utils\.ts$/,
  /\.test\.[tj]sx?$/,
];

function walk(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (SKIP.some(rx => rx.test(full))) continue;
    if (entry.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function rel(file: string): string {
  return relative(WEB_ROOT, file);
}

describe('singular System B — design-system unification ratchet', () => {
  it('keeps the marketing System B wrapper dark, scrollable, and editorial', () => {
    const layout = readFileSync(
      resolve(WEB_ROOT, 'app/(marketing)/layout.tsx'),
      'utf8'
    );
    const globals = readFileSync(resolve(WEB_ROOT, 'app/globals.css'), 'utf8');
    const linearTokens = readFileSync(
      resolve(WEB_ROOT, 'styles/linear-tokens.css'),
      'utf8'
    );
    const designSystem = readFileSync(
      resolve(WEB_ROOT, 'styles/design-system.css'),
      'utf8'
    );

    expect(layout).toContain('system-b-marketing dark');
    expect(layout).not.toContain('linear-marketing');
    expect(globals).toMatch(
      /html:has\(\.system-b-marketing\)[\s\S]*?\{[^}]*overflow-y:\s*auto/
    );
    expect(globals).toMatch(
      /body:has\(\.system-b-marketing\)[\s\S]*?\{[^}]*overflow:\s*visible/
    );
    expect(linearTokens).toContain('.system-b-marketing.dark');
    expect(designSystem).toContain('.system-b-marketing {');
    expect(designSystem).toContain('.system-b-marketing.dark');
    expect(designSystem).toContain('.system-b-marketing h1');
    expect(designSystem).toMatch(
      /\.system-b-marketing button,[\s\S]*?\.system-b-marketing a\[class\*="btn"\]\s*\{[^}]*font-family:\s*var\(--marketing-font-body\)/
    );
    expect(designSystem).not.toMatch(
      /\.system-b-marketing button,[\s\S]*?\.system-b-marketing a\[class\*="btn"\]\s*\{[^}]*font-family:\s*var\(--marketing-font-display\)/
    );
  });

  it('DM Sans is retired: no live source loads it or reads --font-dm-sans', () => {
    const layout = readFileSync(resolve(WEB_ROOT, 'app/layout.tsx'), 'utf8');
    expect(
      layout,
      'app/layout.tsx must not load DM Sans via next/font/local (retired 2026-06-18)'
    ).not.toMatch(/DMSans|--font-dm-sans|\bdmSans\b/);

    const files = [
      ...walk(resolve(WEB_ROOT, 'app'), ['.tsx', '.ts', '.css']),
      ...walk(resolve(WEB_ROOT, 'components'), ['.tsx', '.ts', '.css']),
      ...walk(resolve(WEB_ROOT, 'styles'), ['.css']),
    ];

    const offenders = files
      .filter(file => {
        const src = readFileSync(file, 'utf8');
        return (
          /var\(--font-dm-sans\)/.test(src) || /--font-dm-sans\s*:/.test(src)
        );
      })
      .map(rel);

    expect(
      offenders,
      `DM Sans was retired 2026-06-18. Repoint these to Inter (var(--font-sans)):\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('.linear-marketing wrapper is shrink-only (System A is being retired)', () => {
    // Baseline 2026-06-18. This set may only SHRINK. Removing the wrapper from a
    // surface (reskinning it onto System B tokens) must also remove it here.
    const APPLIERS_ALLOWLIST = new Set<string>([
      'app/(dynamic)/playlists/layout.tsx',
      'app/brand/layout.tsx',
      'app/not-found.tsx',
      'app/pitch/layout.tsx',
      'components/features/home/MarketingScrollUnlock.tsx',
    ]);

    const files = [
      ...walk(resolve(WEB_ROOT, 'app'), ['.tsx', '.ts']),
      ...walk(resolve(WEB_ROOT, 'components'), ['.tsx', '.ts']),
    ];

    const actual = new Set(
      files
        .filter(file => /linear-marketing/.test(readFileSync(file, 'utf8')))
        .map(rel)
    );

    const added = [...actual].filter(file => !APPLIERS_ALLOWLIST.has(file));
    expect(
      added,
      `New .linear-marketing usage — System A is being retired (DESIGN.md 2026-06-18).\n` +
        `Build this surface on System B tokens instead of the System A wrapper:\n${added.join('\n')}`
    ).toEqual([]);

    const stale = [...APPLIERS_ALLOWLIST].filter(file => !actual.has(file));
    expect(
      stale,
      `These no longer use .linear-marketing — delete them from APPLIERS_ALLOWLIST so the ` +
        `ratchet tightens toward full System A retirement:\n${stale.join('\n')}`
    ).toEqual([]);
  });
});
