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

describe('profile shell token contract', () => {
  it('defines the shared profile shell aliases in the design system', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).toContain('--profile-shell-max-width: 430px;');
    expect(contents).toContain('--profile-shell-card-radius: 30px;');
    expect(contents).toContain('--profile-drawer-radius-mobile: 24px;');
  });

  it('uses the shared profile aliases in the canonical shell files', () => {
    expect(readFileSync(PROFILE_DRAWER_SHELL, 'utf8')).toContain(
      '--profile-drawer-radius-mobile'
    );
    expect(readFileSync(PROFILE_DRAWER_SHELL, 'utf8')).toContain(
      '--profile-shell-max-width'
    );
    expect(readFileSync(PROFILE_COMPACT_TEMPLATE, 'utf8')).toContain(
      '--profile-shell-card-radius'
    );
    expect(readFileSync(PROFILE_COMPACT_TEMPLATE, 'utf8')).toContain(
      '--profile-action-radius'
    );
  });
});
