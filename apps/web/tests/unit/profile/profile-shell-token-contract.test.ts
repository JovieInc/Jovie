import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DESIGN_SYSTEM = join(process.cwd(), 'styles', 'design-system.css');
const PROFILE_DRAWER_SHELL = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'ProfileDrawerShell.tsx'
);
const PROFILE_COMPACT_TEMPLATE = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactTemplate.tsx'
);
const PROFILE_COMPACT_SURFACE = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactSurface.tsx'
);

describe('profile shell token contract', () => {
  it('defines the shared profile shell aliases in the design system', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).toMatch(/--profile-shell-max-width\s*:\s*[^;]+;/);
    expect(contents).toMatch(/--profile-shell-card-radius\s*:\s*[^;]+;/);
    expect(contents).toMatch(/--profile-drawer-radius-mobile\s*:\s*[^;]+;/);
    expect(contents).toMatch(/--profile-tab-active-bg\s*:\s*[^;]+;/);
    expect(contents).toMatch(/--profile-status-pill-bg\s*:\s*[^;]+;/);
    expect(contents).toMatch(/--profile-rail-dot-active\s*:\s*[^;]+;/);
  });

  it('uses the shared profile aliases in the canonical shell files', () => {
    const drawerShellContents = readFileSync(PROFILE_DRAWER_SHELL, 'utf8');
    const compactTemplateContents = readFileSync(
      PROFILE_COMPACT_TEMPLATE,
      'utf8'
    );

    expect(drawerShellContents).toContain('--profile-drawer-radius-mobile');
    expect(drawerShellContents).toContain('--profile-shell-max-width');
    expect(compactTemplateContents).toContain('--profile-shell-card-radius');
    const compactSurfaceContents = readFileSync(
      PROFILE_COMPACT_SURFACE,
      'utf8'
    );
    expect(compactSurfaceContents).toContain('--profile-dock-border');
    expect(compactSurfaceContents).toContain('--profile-tab-active-bg');
    expect(compactSurfaceContents).toContain('--profile-status-pill-bg');
  });
});
