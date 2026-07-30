import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_B_CONCENTRIC_SURFACES,
  SYSTEM_B_RADIUS_PX,
  SYSTEM_B_SURFACE_INSET_PX,
} from '@/lib/design/system-b-radius';

const APP_ROOT = join(__dirname, '../../..');
const REPO_ROOT = join(APP_ROOT, '../..');

describe('System B concentric radius contract', () => {
  it('keeps every outer radius equal to its inner radius plus its inset', () => {
    for (const [surface, geometry] of Object.entries(
      SYSTEM_B_CONCENTRIC_SURFACES
    )) {
      expect(
        SYSTEM_B_RADIUS_PX[geometry.outer],
        `${surface} outer radius`
      ).toBe(
        SYSTEM_B_RADIUS_PX[geometry.inner] +
          SYSTEM_B_SURFACE_INSET_PX[geometry.inset]
      );
    }
  });

  it('defines the shared CSS aliases from existing radius and spacing tokens', () => {
    const css = readFileSync(
      join(APP_ROOT, 'styles/design-system.css'),
      'utf-8'
    );

    expect(css).toContain('--system-b-radius-card: var(--radius-xl);');
    expect(css).toMatch(
      /--system-b-radius-card-inner:\s*calc\(\s*var\(--system-b-radius-card\)\s*-\s*var\(--space-1\)\s*\)/
    );
    expect(css).toContain('--system-b-radius-overlay: var(--radius-xl);');
    expect(css).toMatch(
      /--system-b-radius-overlay-inner:\s*calc\(\s*var\(--system-b-radius-overlay\)\s*-\s*var\(--space-1\)\s*\)/
    );
    expect(css).toContain('--system-b-radius-panel: var(--radius-3xl);');
    expect(css).toMatch(
      /--system-b-radius-panel-inner:\s*calc\(\s*var\(--system-b-radius-panel\)\s*-\s*var\(--space-1\)\s*\)/
    );
  });

  it('routes shared card and overlay containers through semantic aliases', () => {
    const card = readFileSync(
      join(REPO_ROOT, 'packages/ui/atoms/card.tsx'),
      'utf-8'
    );
    const dropdown = readFileSync(
      join(REPO_ROOT, 'packages/ui/lib/dropdown-styles.ts'),
      'utf-8'
    );
    const overlay = readFileSync(
      join(REPO_ROOT, 'packages/ui/lib/overlay-styles.ts'),
      'utf-8'
    );
    const themeTokens = readFileSync(
      join(REPO_ROOT, 'packages/ui/theme/tokens.ts'),
      'utf-8'
    );

    expect(card).toContain('rounded-(--system-b-radius-card)');
    expect(card).not.toContain('rounded-[');
    expect(dropdown).toContain('rounded-(--system-b-radius-overlay)');
    expect(dropdown).toContain('rounded-(--system-b-radius-overlay-inner)');
    expect(dropdown).not.toContain('rounded-[');
    expect(overlay).toContain('rounded-(--system-b-radius-panel)');
    expect(overlay).not.toContain('rounded-[');
    expect(themeTokens).toContain('export const concentricRadii');
    expect(themeTokens).toContain('var(--system-b-radius-card-inner)');
  });
});
