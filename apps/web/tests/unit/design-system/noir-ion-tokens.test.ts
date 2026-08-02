import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jovie Noir Ion dark-mode contract (JOV-4635 / #15244).
 *
 * Locks approved anchors into the live token emitters so agents cannot
 * silently regress to carbon-palette dark values or introduce a second theme.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');

const designSystem = readFileSync(
  join(WEB_ROOT, 'styles', 'design-system.css'),
  'utf8'
);
const linearTokens = readFileSync(
  join(WEB_ROOT, 'styles', 'linear-tokens.css'),
  'utf8'
);

/** Find a dark block that contains a distinctive Noir Ion marker. */
function darkBlockContaining(css: string, marker: string): string {
  const blocks = css.match(/:root\.dark(?:\s*,[^{]+)?\s*\{[\s\S]*?\n\}/g) ?? [];
  const hit = blocks.find(block => block.includes(marker));
  expect(hit, `expected a :root.dark block containing ${marker}`).toBeTruthy();
  return hit ?? '';
}

describe('Noir Ion — approved dark anchors', () => {
  // Surface/accent anchors live in the large Noir Ion :root.dark block.
  const dsDark = darkBlockContaining(designSystem, '--noir-ion-canvas');
  const linearDark = darkBlockContaining(
    linearTokens,
    '--linear-app-content-surface: #0a0d16'
  );

  it('defines Noir Ion surface anchors and maps product tokens to them', () => {
    expect(dsDark).toContain('--noir-ion-canvas: #030407;');
    expect(dsDark).toContain('--noir-ion-shell: #06080d;');
    expect(dsDark).toContain('--noir-ion-panel: #0a0d16;');
    expect(dsDark).toContain('--noir-ion-card: #0f1420;');
    expect(dsDark).toContain('--noir-ion-elevated: #151b2a;');
    expect(dsDark).toContain('--noir-ion-floating: #1b2436;');

    expect(dsDark).toContain('--color-bg-base: var(--noir-ion-canvas);');
    expect(dsDark).toContain('--color-bg-page: var(--noir-ion-canvas);');
    expect(dsDark).toContain('--color-bg-surface-0: var(--noir-ion-shell);');
    expect(dsDark).toContain('--color-bg-surface-2: var(--noir-ion-elevated);');
    expect(dsDark).toContain('--color-bg-surface-3: var(--noir-ion-floating);');
  });

  it('maps shell canvas + sidebar to Noir Ion shell ladder', () => {
    expect(linearDark).toContain('--linear-bg-page: #06080d;');
    expect(linearDark).toContain('--linear-app-content-surface: #0a0d16;');
    expect(linearDark).toContain('--linear-bg-surface-1: #0f1420;');
    expect(linearDark).toContain(
      '--linear-app-sidebar-background-rgb: 6 8 13;'
    );
  });

  it('uses Ion electric blue for routine action, focus, and selection', () => {
    expect(dsDark).toContain('--noir-ion-ion: #11afff;');
    expect(dsDark).toContain('--color-accent-blue: #11afff;');
    expect(dsDark).toContain('--color-accent: var(--noir-ion-ion);');
    expect(dsDark).toContain('--color-border-focus: var(--noir-ion-ion);');
    expect(dsDark).toContain('--color-focus-ring: var(--noir-ion-focus-ring);');
    expect(dsDark).toContain('--color-bg-selected: var(--noir-ion-selected);');

    expect(linearDark).toContain(
      '--linear-border-focus: rgba(17, 175, 255, 0.72);'
    );
    expect(linearDark).toContain(
      '--linear-row-selected: rgba(17, 175, 255, 0.1);'
    );
  });

  it('keeps accent semantics for Ultra, Pulse, Aqua, Mint, Gold, Flare', () => {
    expect(dsDark).toContain('--color-accent-purple: #a982ff;');
    expect(dsDark).toContain('--color-accent-pink: #ff48d2;');
    expect(dsDark).toContain('--color-accent-teal: #24f6d2;');
    expect(dsDark).toContain('--color-accent-green: #39e58c;');
    expect(dsDark).toContain('--color-accent-orange: #ffc857;');
    expect(dsDark).toContain('--color-accent-red: #ff677d;');
  });

  it('maps info to Aqua (system), not Ion blue', () => {
    // Second :root.dark status block — search whole file
    expect(designSystem).toMatch(
      /:root\.dark\s*\{[\s\S]*--color-info:\s*var\(--color-accent-teal\);/
    );
  });

  it('does not introduce a parallel theme provider class for the palette', () => {
    // Rollback is semantic mapping via --noir-ion-* vars, not a second DS.
    expect(designSystem).not.toMatch(/\.theme-noir-ion\s*\{/);
    expect(designSystem).not.toMatch(/data-theme\s*=\s*["']noir-ion["']/);
  });
});
