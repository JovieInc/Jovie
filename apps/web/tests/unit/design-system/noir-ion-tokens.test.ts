import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JOVIE_IMAGE_COLOR_POLICY } from '@/data/marketing';

/**
 * Jovie Noir Ion / noir-ion-ziawi lock (2026-09-09–10).
 *
 * Locks approved anchors into the live token emitters so agents cannot
 * silently regress to carbon-palette dark values, a sixth surface, or
 * retired focus hues.
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

function lightBlockContaining(css: string, marker: string): string {
  const blocks = css.match(/:root(?:\.dark)?(?:\s*,[^{]+)?\s*\{[\s\S]*?\n\}/g) ?? [];
  const hit = blocks.find(
    block =>
      /^:root\b(?!\.dark)/.test(block.slice(0, block.indexOf('{'))) &&
      block.includes(marker)
  );
  expect(hit, `expected a :root block containing ${marker}`).toBeTruthy();
  return hit ?? '';
}

describe('Noir Ion — approved dark anchors', () => {
  const dsDark = darkBlockContaining(designSystem, '--noir-ion-canvas');
  const dsLight = lightBlockContaining(designSystem, '--noir-ion-canvas');
  const linearDark = darkBlockContaining(linearTokens, '--linear-bg-page');

  it('defines exactly five Noir Ion surfaces and maps product tokens to them', () => {
    expect(dsDark).toContain('--noir-ion-canvas: #030407;');
    expect(dsDark).toContain('--noir-ion-shell: #06080d;');
    expect(dsDark).toContain('--noir-ion-card: #0f1420;');
    expect(dsDark).toContain('--noir-ion-elevated: #151b2a;');
    expect(dsDark).toContain('--noir-ion-floating: #1b2436;');
    expect(dsDark).not.toMatch(/--noir-ion-panel\s*:/);

    expect(dsDark).toContain('--color-bg-base: var(--noir-ion-canvas);');
    expect(dsDark).toContain('--color-bg-page: var(--noir-ion-canvas);');
    expect(dsDark).toContain('--color-bg-surface-0: var(--noir-ion-shell);');
    expect(dsDark).toContain('--color-bg-surface-1: var(--noir-ion-card);');
    expect(dsDark).toContain('--color-bg-surface-2: var(--noir-ion-elevated);');
    expect(dsDark).toContain('--color-bg-surface-3: var(--noir-ion-floating);');
    expect(dsDark).toContain('--color-bg-elevated: var(--noir-ion-elevated);');
    expect(dsDark).toContain('--app-shell-content-surface: #0f1420;');
  });

  it('locks the light five-step ladder', () => {
    expect(dsLight).toContain('--noir-ion-canvas: #f8fafd;');
    expect(dsLight).toContain('--noir-ion-shell: #f3f5f8;');
    expect(dsLight).toContain('--noir-ion-card: #eaedf1;');
    expect(dsLight).toContain('--noir-ion-elevated: #dfe3e8;');
    expect(dsLight).toContain('--noir-ion-floating: #d4d9e0;');
    expect(dsLight).not.toMatch(/--noir-ion-panel\s*:/);
  });

  it('maps shell canvas + sidebar to Noir Ion shell ladder', () => {
    expect(linearDark).toContain('--linear-bg-page: #06080d;');
    expect(linearDark).toContain('--linear-bg-surface-1: #0f1420;');
    expect(dsDark).toContain('--app-shell-sidebar-background-rgb: 6 8 13;');
  });

  it('uses ion for routine action, selection, and product focus', () => {
    expect(dsDark).toContain('--noir-ion-ion: #1f7bf5;');
    expect(dsDark).toContain('--color-accent-blue: #1f7bf5;');
    expect(dsDark).toContain('--color-accent: var(--noir-ion-ion);');
    expect(dsDark).toContain('--color-border-focus: #1f7bf5;');
    expect(dsDark).toContain('--color-focus-ring: var(--color-border-focus);');
    expect(dsDark).toContain('--color-bg-selected: var(--noir-ion-selected);');
    expect(dsLight).toContain('--color-border-focus: #1f7bf5;');
    expect(dsLight).toContain('--color-accent: #1f7bf5;');
    expect(dsDark.toLowerCase()).not.toContain('#11afff');
    expect(dsDark.toLowerCase()).not.toContain('#2563ff');
    expect(dsLight.toLowerCase()).not.toContain('#2563ff');
    expect(dsLight.toLowerCase()).not.toContain('#7170ff');
    expect(linearDark).toContain(
      '--linear-border-focus: rgba(31, 123, 245, 0.72);'
    );
    expect(linearDark).toContain(
      '--linear-row-selected: rgba(31, 123, 245, 0.1);'
    );
    expect(linearDark).toContain('--linear-panel-bg: #0f1420;');
    expect(linearDark).not.toContain('--linear-panel-bg: #0a0d16;');
  });

  it('keeps generated-scene references separate from shipped UI anchors', () => {
    const sceneByRole = new Map(
      JOVIE_IMAGE_COLOR_POLICY.scenePalette.map(entry => [entry.role, entry])
    );

    expect(sceneByRole.get('ion')?.uiAnchor.hex).toBe('#1F7BF5');
    expect(sceneByRole.get('ultra')?.uiAnchor.hex).toBe('#8E56F5');
    expect(sceneByRole.get('pulse')?.uiAnchor.hex).toBe('#F52BB5');
    expect(sceneByRole.get('ion')?.sceneReference.hex).toBe('#3FAFF3');
    expect(sceneByRole.get('ultra')?.sceneReference.hex).toBe('#A789F0');
    expect(sceneByRole.get('pulse')?.sceneReference.hex).toBe('#EB6AC6');

    expect(designSystem.toLowerCase()).not.toContain('#3faff3');
    expect(designSystem.toLowerCase()).not.toContain('#a789f0');
    expect(designSystem.toLowerCase()).not.toContain('#eb6ac6');
    expect(linearTokens.toLowerCase()).not.toContain('#3faff3');
    expect(linearTokens.toLowerCase()).not.toContain('#a789f0');
    expect(linearTokens.toLowerCase()).not.toContain('#eb6ac6');
  });

  it('locks six accents and aliases aqua/gold/flare', () => {
    expect(dsDark).toContain('--noir-ion-ultra: #8e56f5;');
    expect(dsDark).toContain('--noir-ion-pulse: #f52bb5;');
    expect(dsDark).toContain('--noir-ion-mint: #3ffa8b;');
    expect(dsDark).toContain('--noir-ion-orange: #ff7800;');
    expect(dsDark).toContain('--noir-ion-red: #f72a36;');
    expect(dsDark).toContain('--noir-ion-aqua: #3ffa8b;');
    expect(dsDark).toContain('--noir-ion-gold: #ff7800;');
    expect(dsDark).toContain('--noir-ion-flare: #f72a36;');
    expect(dsDark).toContain('--color-accent-purple: #8e56f5;');
    expect(dsDark).toContain('--color-accent-pink: #f52bb5;');
    expect(dsDark).toContain('--color-accent-teal: #3ffa8b;');
    expect(dsDark).toContain('--color-accent-green: #3ffa8b;');
    expect(dsDark).toContain('--color-accent-orange: #ff7800;');
    expect(dsDark).toContain('--color-accent-red: #f72a36;');
  });

  it('keeps dark info aliased to teal (mint after aqua→mint)', () => {
    expect(designSystem).toMatch(
      /:root\.dark\s*\{[\s\S]*--color-info:\s*var\(--color-accent-teal\);/
    );
  });

  it('does not introduce a parallel theme provider class for the palette', () => {
    expect(designSystem).not.toMatch(/\.theme-noir-ion\s*\{/);
    expect(designSystem).not.toMatch(/data-theme\s*=\s*["']noir-ion["']/);
  });
});
