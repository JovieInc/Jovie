/**
 * Sidebar group labels (Account / Artist / Workspaces / Today …) render 12px
 * `text-sidebar-muted` on the sidebar background. In the light theme the old
 * 112 116 124 muted value (and its /90 opacity variants) measured 3.66–4.4:1
 * in the authed axe audit (WCAG AA needs 4.5:1 for normal text).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OPERATOR_NAV_GROUP_LABEL } from '@/components/organisms/operator-navigation';
import { contrastRatio } from '@/lib/utils/color';

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function readTriple(file: string, name: string): string {
  const css = readFileSync(join(WEB_ROOT, 'styles', file), 'utf8');
  const match = new RegExp(`${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`).exec(
    css
  );
  if (!match) throw new Error(`${name} not found as an rgb triple in ${file}`);
  return `#${match
    .slice(1, 4)
    .map(channel => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('light sidebar muted label contrast', () => {
  it('meets WCAG AA for 12px text on the sidebar background', () => {
    const background = readTriple(
      'design-system.css',
      '--app-shell-sidebar-background-rgb'
    );
    for (const [file, name] of [
      ['design-system.css', '--app-shell-sidebar-muted-rgb'],
      ['system-b-app.css', '--sidebar-muted'],
      ['system-b-app.css', '--sidebar-muted-foreground'],
    ] as const) {
      expect(
        contrastRatio(readTriple(file, name), background),
        `${file} ${name}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps group label text at full token opacity', () => {
    // An opacity modifier blends the label toward the background and
    // re-breaks AA even when the token itself passes.
    expect(OPERATOR_NAV_GROUP_LABEL).toContain('text-sidebar-muted');
    expect(OPERATOR_NAV_GROUP_LABEL).not.toMatch(/text-sidebar-muted\/\d+/);
  });
});
