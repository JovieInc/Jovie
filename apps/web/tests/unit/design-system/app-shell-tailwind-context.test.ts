import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const GLOBALS_CSS = readFileSync(join(WEB_ROOT, 'app', 'globals.css'), 'utf8');
const SYSTEM_B_CSS = readFileSync(
  join(WEB_ROOT, 'styles', 'system-b-app.css'),
  'utf8'
);
const FOUNDATION_CSS = readFileSync(
  join(WEB_ROOT, 'styles', 'tailwind-foundation.css'),
  'utf8'
);

/**
 * JOV-2269 regression guard.
 *
 * globals.css excludes app-shell-only source directories from the global
 * Tailwind scan so their utility classes stay out of the shared public
 * stylesheet. Those directories still render — under layouts that load
 * styles/system-b-app.css, which is a second Tailwind context that scans
 * the same directories. If a directory is dropped from either side of that
 * boundary (excluded from the global scan without being scanned by
 * system-b, or vice versa), utility classes silently go missing on app
 * routes. This spec pins the boundary.
 *
 * Exclusions in globals.css that intentionally have NO system-b source are
 * non-UI trees (route handlers, server actions) and test/tooling paths.
 */
const APP_SHELL_SCAN_DIRS = [
  '../app/app',
  '../app/onboarding',
  '../app/demo',
  '../app/exp',
  '../app/ui',
  '../app/(dynamic)/start',
  '../app/unavailable',
  '../components/features/dashboard',
  '../components/features/admin',
  '../components/features/chat',
  '../components/features/bridge',
  '../components/features/connectors',
  '../components/features/creator',
  '../components/features/examples',
  '../components/features/feedback',
  '../components/features/library',
  '../components/features/listen',
  '../components/features/monitoring',
  '../components/features/onboarding',
  '../components/features/opportunity-inbox',
  '../components/features/pay',
  '../components/features/releases',
  '../components/features/settings',
  '../components/features/tracking',
  '../components/features/ui',
  '../components/jovie',
  '../components/onboarding',
  '../components/canonical',
  '../components/design-studio',
  '../components/effects',
  '../components/seo',
] as const;

describe('app-shell Tailwind context boundary (JOV-2269)', () => {
  it('excludes every app-shell dir from the global scan', () => {
    for (const dir of APP_SHELL_SCAN_DIRS) {
      expect(
        GLOBALS_CSS,
        `globals.css is missing @source not "${dir}"`
      ).toContain(`@source not "${dir}"`);
    }
  });

  it('scans every app-shell dir in the system-b context', () => {
    for (const dir of APP_SHELL_SCAN_DIRS) {
      expect(
        SYSTEM_B_CSS,
        `system-b-app.css is missing @source "${dir}"`
      ).toContain(`@source "${dir}"`);
    }
  });

  it('keeps the system-b context self-contained (source(none) + tailwind)', () => {
    expect(SYSTEM_B_CSS).toContain('@import "tailwindcss" source(none)');
    expect(SYSTEM_B_CSS).toContain(
      '@import "./tailwind-foundation.css" reference'
    );
  });

  it('emits the shared foundation once via globals.css', () => {
    expect(GLOBALS_CSS).toContain(
      '@import "../styles/tailwind-foundation.css"'
    );
    // The foundation itself must carry the shared theme/utilities that used
    // to live inline in globals.css.
    for (const needle of [
      '@custom-variant dark',
      '@theme {',
      '@theme inline {',
      '@utility scale-press',
      '--color-sidebar:',
    ]) {
      expect(FOUNDATION_CSS).toContain(needle);
    }
  });

  it('keeps globals.css free of the moved foundation blocks', () => {
    // Guard against copy-back drift: the blocks live in the foundation file.
    expect(GLOBALS_CSS).not.toMatch(/@custom-variant dark/);
    expect(GLOBALS_CSS).not.toMatch(/^@theme \{/m);
    expect(GLOBALS_CSS).not.toMatch(/^@utility [^{\n]+\{/m);
  });
});
