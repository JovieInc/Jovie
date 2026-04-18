import { describe, expect, it } from 'vitest';
import { getLatestRelease, parseChangelog } from '../changelog-parser.mjs';

const SAMPLE_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- New dashboard widget for analytics
- Email subscription for product updates

### Fixed

- Profile page loading speed improved

## [26.4.8] - 2026-03-18

### Added

- Workspace archive script

### Changed

- Homepage hero messaging updated
- SQL queries parameterized for security

### Fixed

- Run script no longer double-wraps secrets

## [26.4.7] - 2026-03-18

### Added

- New cleanup mode for test accounts

### Changed

- Tables now use identical bulk actions toolbar UX
`;

const EMPTY_UNRELEASED = `# Changelog

## [Unreleased]

### Added

-

### Changed

-

### Fixed

-

## [26.4.8] - 2026-03-18

### Added

- Something
`;

const MALFORMED = `# Changelog

## [Unreleased]

Some random text without section headings

- A bullet without a section

## [1.0.0]

### Added
- Feature one
- Feature two

### WeirdSection
- This should be ignored

- Orphan bullet
`;

describe('parseChangelog', () => {
  it('parses a valid changelog into structured data', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);

    expect(result.unreleased.sections.added).toEqual([
      'New dashboard widget for analytics',
      'Email subscription for product updates',
    ]);
    expect(result.unreleased.sections.fixed).toEqual([
      'Profile page loading speed improved',
    ]);

    expect(result.releases).toHaveLength(2);

    expect(result.releases[0].version).toBe('26.4.8');
    expect(result.releases[0].date).toBe('2026-03-18');
    expect(result.releases[0].sections.added).toEqual([
      'Workspace archive script',
    ]);
    expect(result.releases[0].sections.changed).toHaveLength(2);
    expect(result.releases[0].sections.fixed).toHaveLength(1);

    expect(result.releases[1].version).toBe('26.4.7');
    expect(result.releases[1].date).toBe('2026-03-18');
  });

  it('handles empty unreleased section', () => {
    const result = parseChangelog(EMPTY_UNRELEASED);

    // Template entries like "- " (just a dash and space) should not be parsed as entries
    expect(result.unreleased.sections.added || []).toEqual([]);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].version).toBe('26.4.8');
  });

  it('handles malformed changelog gracefully', () => {
    const result = parseChangelog(MALFORMED);

    // Should not crash
    expect(result.unreleased).toBeDefined();
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].version).toBe('1.0.0');
    // Known section entries are correctly parsed
    expect(result.releases[0].sections.added).toContain('Feature one');
    expect(result.releases[0].sections.added).toContain('Feature two');
    // Unknown section headings (### WeirdSection) are not recognized,
    // so bullets after them stay in the last known section (best-effort)
  });

  it('handles completely empty input', () => {
    const result = parseChangelog('');
    expect(result.unreleased.raw).toBe('');
    expect(result.releases).toEqual([]);
  });

  it('handles version without date', () => {
    const md = `## [Unreleased]\n\n## [1.0.0]\n\n### Added\n\n- Thing\n`;
    const result = parseChangelog(md);
    expect(result.releases[0].version).toBe('1.0.0');
    expect(result.releases[0].date).toBe('');
  });

  it('auto-filters entries with vendor names into internalSections', () => {
    const md = `## [1.0.0] - 2026-03-20

### Fixed

- Fixed sign-in page loading
- Fix auth not loading by reverting Clerk proxy
- Reduced Sentry error noise
`;
    const result = parseChangelog(md);
    expect(result.releases[0].sections.fixed).toEqual([
      'Fixed sign-in page loading',
    ]);
    expect(result.releases[0].internalSections.fixed).toEqual([
      'Fix auth not loading by reverting Clerk proxy',
      'Reduced Sentry error noise',
    ]);
  });

  it('auto-filters entries with dev tooling and infrastructure keywords', () => {
    const md = `## [1.0.0] - 2026-03-20

### Added

- New feature for users
- E2E test coverage for onboarding
- Dev toolbar toggle button
- Screenshot spec uses demo route
`;
    const result = parseChangelog(md);
    expect(result.releases[0].sections.added).toEqual([
      'New feature for users',
    ]);
    expect(result.releases[0].internalSections.added).toHaveLength(3);
  });

  it('does not auto-filter legitimate user-facing entries', () => {
    const md = `## [1.0.0] - 2026-03-20

### Added

- Spotify import shows real progress
- Your profile now shows your top 3 genres

### Fixed

- Tips now process correctly
`;
    const result = parseChangelog(md);
    expect(result.releases[0].sections.added).toEqual([
      'Spotify import shows real progress',
      'Your profile now shows your top 3 genres',
    ]);
    expect(result.releases[0].sections.fixed).toEqual([
      'Tips now process correctly',
    ]);
  });

  it('does not treat lowercase common words as vendor leaks', () => {
    const md = `## [1.0.0] - 2026-03-20

### Changed

- Added turbo mode for playlist cleanup
- conductor notes now show in exported setlists
- Reduced Sentry error noise
`;
    const result = parseChangelog(md);
    expect(result.releases[0].sections.changed).toEqual([
      'Added turbo mode for playlist cleanup',
      'conductor notes now show in exported setlists',
    ]);
    expect(result.releases[0].internalSections.changed).toEqual([
      'Reduced Sentry error noise',
    ]);
  });

  it('treats suffix-tagged internal entries as internal', () => {
    const md = `## [1.0.0] - 2026-03-20

### Changed

- Public launch checklist refresh
- Shared cron auth helper with timing-safe bearer verification [INTERNAL]
`;
    const result = parseChangelog(md);
    expect(result.releases[0].sections.changed).toEqual([
      'Public launch checklist refresh',
    ]);
    expect(result.releases[0].internalSections.changed).toEqual([
      'Shared cron auth helper with timing-safe bearer verification [INTERNAL]',
    ]);
  });

  it('drops internal summaries from public output', () => {
    const md = `## [1.0.0] - 2026-03-20

> Hardened webhook dispatch with Redis-backed dedupe [internal]

### Fixed

- Tips now process correctly
`;
    const result = parseChangelog(md);
    expect(result.releases[0].summary).toBe('');
    expect(result.releases[0].sections.fixed).toEqual([
      'Tips now process correctly',
    ]);
  });

  it('does not promote a later blockquote when the first summary is internal', () => {
    const md = `## [1.0.0] - 2026-03-20

> Hardened webhook dispatch with Redis-backed dedupe [internal]
> Customer-facing summary that should stay hidden

### Fixed

- Tips now process correctly
`;
    const result = parseChangelog(md);
    expect(result.releases[0].summary).toBe('');
  });

  it('keeps public admin-role and token entries visible', () => {
    const md = `## [1.0.0] - 2026-03-20

### Changed

- Team admins can now manage subscription billing
- Users can now revoke personal API tokens
- Design tokens now support accent overrides
`;
    const result = parseChangelog(md);
    expect(result.releases[0].sections.changed).toEqual([
      'Team admins can now manage subscription billing',
      'Users can now revoke personal API tokens',
      'Design tokens now support accent overrides',
    ]);
  });
});

describe('getLatestRelease', () => {
  it('returns the first release after unreleased', () => {
    const release = getLatestRelease(SAMPLE_CHANGELOG);
    expect(release.version).toBe('26.4.8');
    expect(release.date).toBe('2026-03-18');
    expect(release.sections.added).toHaveLength(1);
  });

  it('returns null when no releases exist', () => {
    const release = getLatestRelease('## [Unreleased]\n\n- Something\n');
    expect(release).toBeNull();
  });
});
