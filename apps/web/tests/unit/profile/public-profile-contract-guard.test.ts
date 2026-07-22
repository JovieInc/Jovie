import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const STATIC_ARTIST_PAGE = join(
  ROOT,
  'components',
  'features',
  'profile',
  'StaticArtistPage.tsx'
);
const PROFILE_DRAWER_SHELL = join(
  ROOT,
  'components',
  'features',
  'profile',
  'ProfileDrawerShell.tsx'
);
const PROFILE_COMPACT_TEMPLATE = join(
  ROOT,
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactTemplate.tsx'
);
const PROFILE_COMPACT_SURFACE = join(
  ROOT,
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactSurface.tsx'
);
const PROFILE_SHELL = join(
  ROOT,
  'components',
  'organisms',
  'profile-shell',
  'ProfileShell.tsx'
);
const DESIGN_SYSTEM = join(ROOT, 'styles', 'design-system.css');

const REPRESENTATIVE_PROFILE_ENTRYPOINTS = [
  join(ROOT, 'app', '[username]', 'page.tsx'),
  // ProgressiveArtistPage.tsx deleted in JOV-2022 legacy cleanup (no live route callers)
  join(ROOT, 'components', 'features', 'demo', 'DemoPublicProfileSurface.tsx'),
  join(
    ROOT,
    'components',
    'features',
    'dashboard',
    'molecules',
    'ProfilePreview.tsx'
  ),
  join(
    ROOT,
    'components',
    'features',
    'dashboard',
    'organisms',
    'DashboardPreview.tsx'
  ),
] as const;

describe('public profile contract guard', () => {
  it('keeps StaticArtistPage pinned to the canonical public profile view-model builder', () => {
    const contents = readFileSync(STATIC_ARTIST_PAGE, 'utf8');

    expect(contents).toMatch(
      /import\s*\{\s*buildProfilePublicViewModel\s*\}\s*from\s*['"]@\/features\/profile\/view-models['"]/
    );
    expect(contents).toMatch(/buildProfilePublicViewModel\s*\(\s*\{/);
    expect(contents).toContain("presentation = 'full-public'");
    expect(contents).toContain('<ProfileCompactTemplate');
  });

  it('keeps representative live, demo, and preview surfaces on the shared StaticArtistPage entrypoint', () => {
    const offenders = REPRESENTATIVE_PROFILE_ENTRYPOINTS.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return !contents.includes('<StaticArtistPage');
    });

    expect(offenders).toEqual([]);
  });

  it('keeps demo and preview surfaces on the compact preview presentation', () => {
    const compactPreviewEntrypoints =
      REPRESENTATIVE_PROFILE_ENTRYPOINTS.slice(1);
    const offenders = compactPreviewEntrypoints.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return !contents.includes("presentation='compact-preview'");
    });

    expect(offenders).toEqual([]);
  });

  it('keeps shared profile shell files on semantic profile token aliases', () => {
    expect(readFileSync(PROFILE_DRAWER_SHELL, 'utf8')).toContain(
      '--profile-drawer-radius-mobile'
    );
    expect(readFileSync(PROFILE_DRAWER_SHELL, 'utf8')).toContain(
      '--profile-shell-max-width'
    );
    expect(readFileSync(PROFILE_COMPACT_TEMPLATE, 'utf8')).toContain(
      '--profile-shell-card-radius'
    );
    expect(readFileSync(PROFILE_COMPACT_SURFACE, 'utf8')).toContain(
      '--profile-content-bg'
    );
    // The hero legibility gradient is the --profile-stage-bg consumer: the
    // surface renders the class hook, the token reference lives in the
    // gradient rule in design-system.css.
    expect(readFileSync(PROFILE_COMPACT_SURFACE, 'utf8')).toContain(
      'profile-cover-home-gradient'
    );
    expect(readFileSync(DESIGN_SYSTEM, 'utf8')).toMatch(
      /\.profile-cover-home-gradient[\s\S]{0,400}var\(--profile-stage-bg\)/
    );
    expect(readFileSync(PROFILE_SHELL, 'utf8')).toContain(
      '--profile-shell-header-max-width'
    );
  });

  it('does not reserve hidden notifications CTA space above the compact profile rail', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toContain('hideTrigger');
    expect(contents).not.toContain('profile-inline-cta-placeholder');
    expect(contents).not.toContain('min-h-[116px]');
  });
});
