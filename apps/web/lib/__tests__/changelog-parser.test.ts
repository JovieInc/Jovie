import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../changelog-parser';

const BASIC_CHANGELOG = `# Changelog

## [2.0.0] - 2026-03-20

> Big update with new features and improvements.

### Added

- New dashboard widget
- [internal] Added migration for widget table

### Fixed

- Profile page loads faster
- [internal] Fixed N+1 query in profile loader

## [1.0.0] - 2026-03-17

> Initial launch.

### Added

- User profiles
- Smart links
`;

describe('parseChangelog', () => {
  it('parses releases with version and date', () => {
    const releases = parseChangelog(BASIC_CHANGELOG);
    expect(releases).toHaveLength(2);
    expect(releases[0].version).toBe('2.0.0');
    expect(releases[0].date).toBe('2026-03-20');
    expect(releases[1].version).toBe('1.0.0');
    expect(releases[1].date).toBe('2026-03-17');
  });

  it('captures summary blockquotes', () => {
    const releases = parseChangelog(BASIC_CHANGELOG);
    expect(releases[0].summary).toBe(
      'Big update with new features and improvements.'
    );
    expect(releases[1].summary).toBe('Initial launch.');
  });

  it('filters out [internal] entries', () => {
    const releases = parseChangelog(BASIC_CHANGELOG);
    expect(releases[0].sections.added).toEqual(['New dashboard widget']);
    expect(releases[0].sections.fixed).toEqual(['Profile page loads faster']);
  });

  it('does not include [internal] entries in any section', () => {
    const releases = parseChangelog(BASIC_CHANGELOG);
    for (const release of releases) {
      for (const entries of Object.values(release.sections)) {
        for (const entry of entries) {
          expect(entry).not.toMatch(/^\[internal\]/);
        }
      }
    }
  });

  it('hides releases where all entries are internal', () => {
    const md = `# Changelog

## [2.0.0] - 2026-03-20

> Internal only release.

### Fixed

- [internal] CI pipeline fix
- [internal] Migration cleanup

## [1.0.0] - 2026-03-17

### Added

- User profiles
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe('1.0.0');
  });

  it('skips [Unreleased] section', () => {
    const md = `# Changelog

## [Unreleased]

### Added

- Upcoming feature

## [1.0.0] - 2026-03-17

### Added

- Launched
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe('1.0.0');
  });

  it('handles release with no summary', () => {
    const md = `## [1.0.0] - 2026-03-17

### Added

- Feature one
`;
    const releases = parseChangelog(md);
    expect(releases[0].summary).toBe('');
    expect(releases[0].sections.added).toEqual(['Feature one']);
  });

  it('handles version without date', () => {
    const md = `## [1.0.0]

### Added

- Feature
`;
    const releases = parseChangelog(md);
    expect(releases[0].date).toBe('');
  });

  it('returns empty array for empty input', () => {
    expect(parseChangelog('')).toEqual([]);
  });

  it('handles all four section types', () => {
    const md = `## [1.0.0] - 2026-01-01

### Added

- New thing

### Changed

- Updated thing

### Fixed

- Broken thing

### Removed

- Old thing
`;
    const releases = parseChangelog(md);
    expect(releases[0].sections.added).toEqual(['New thing']);
    expect(releases[0].sections.changed).toEqual(['Updated thing']);
    expect(releases[0].sections.fixed).toEqual(['Broken thing']);
    expect(releases[0].sections.removed).toEqual(['Old thing']);
  });

  it('only captures the first blockquote as summary', () => {
    const md = `## [1.0.0] - 2026-01-01

> First summary line.

### Added

- Feature
`;
    const releases = parseChangelog(md);
    expect(releases[0].summary).toBe('First summary line.');
  });

  it('handles mixed public and internal entries in same section', () => {
    const md = `## [1.0.0] - 2026-01-01

### Added

- Public feature A
- [internal] Secret internal thing
- Public feature B
- [internal] Another internal thing
`;
    const releases = parseChangelog(md);
    expect(releases[0].sections.added).toEqual([
      'Public feature A',
      'Public feature B',
    ]);
  });

  it('auto-filters entries with vendor names', () => {
    const md = `## [1.0.0] - 2026-01-01

### Fixed

- Fixed sign-in page loading
- Fix auth not loading by reverting Clerk proxy from SDK
- Reduced Sentry error noise by filtering non-actionable errors
- Upgraded Biome 2.3.11 → 2.4.8
`;
    const releases = parseChangelog(md);
    expect(releases[0].sections.fixed).toEqual(['Fixed sign-in page loading']);
  });

  it('auto-filters entries with dev tooling keywords', () => {
    const md = `## [1.0.0] - 2026-01-01

### Added

- New dashboard feature
- Golden path E2E test coverage for onboarding
- Screenshot spec uses demo route
- Dev toolbar toggle for service worker
`;
    const releases = parseChangelog(md);
    expect(releases[0].sections.added).toEqual(['New dashboard feature']);
  });

  it('auto-filters entries with infrastructure patterns', () => {
    const md = `## [1.0.0] - 2026-01-01

### Fixed

- Improved page load speed
- OAuth login on staging redirecting to staging.jov.ie/__clerk
- Bump connection pool from 10 to 20
`;
    const releases = parseChangelog(md);
    expect(releases[0].sections.fixed).toEqual(['Improved page load speed']);
  });

  it('does not auto-filter legitimate user-facing entries', () => {
    const md = `## [1.0.0] - 2026-01-01

### Added

- New dashboard widget
- Spotify import shows real progress
- Your profile now shows your top 3 genres

### Fixed

- Tips now process correctly
- Sign-in page loads faster
`;
    const releases = parseChangelog(md);
    expect(releases[0].sections.added).toEqual([
      'New dashboard widget',
      'Spotify import shows real progress',
      'Your profile now shows your top 3 genres',
    ]);
    expect(releases[0].sections.fixed).toEqual([
      'Tips now process correctly',
      'Sign-in page loads faster',
    ]);
  });

  it('hides releases where all entries are auto-filtered', () => {
    const md = `## [2.0.0] - 2026-03-20

### Fixed

- Upgraded Biome 2.3.11 → 2.4.8
- Fix Clerk proxy on staging

## [1.0.0] - 2026-03-17

### Added

- User profiles
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe('1.0.0');
  });
});
