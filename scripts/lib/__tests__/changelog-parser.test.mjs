import { describe, expect, it } from 'vitest';
import {
  getLatestRelease,
  getUnreleased,
  hasUnreleasedEntries,
  parseChangelog,
  replaceUnreleased,
} from '../changelog-parser.mjs';

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

- Conductor workspace archive script

### Changed

- Homepage hero messaging updated
- SQL queries parameterized for security

### Fixed

- Conductor run script no longer double-wraps Doppler secrets

## [26.4.7] - 2026-03-18

### Added

- Non-interactive cleanup mode for E2E test accounts

### Changed

- Admin tables now use identical bulk actions toolbar UX
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
      'Conductor workspace archive script',
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
});

describe('getUnreleased', () => {
  it('returns raw unreleased content', () => {
    const raw = getUnreleased(SAMPLE_CHANGELOG);
    expect(raw).toContain('New dashboard widget');
    expect(raw).toContain('Profile page loading speed');
  });

  it('returns empty string for empty unreleased', () => {
    const raw = getUnreleased('## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n');
    expect(raw).toBe('');
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

describe('replaceUnreleased', () => {
  it('replaces unreleased content while preserving the rest', () => {
    const newContent = '### Added\n\n- Replaced entry\n';
    const result = replaceUnreleased(SAMPLE_CHANGELOG, newContent);

    expect(result).toContain('## [Unreleased]');
    expect(result).toContain('Replaced entry');
    expect(result).not.toContain('New dashboard widget');
    // Original releases should be preserved
    expect(result).toContain('## [26.4.8]');
    expect(result).toContain('Conductor workspace archive script');
  });

  it('throws if no [Unreleased] section exists', () => {
    expect(() => replaceUnreleased('# Changelog\n', 'new stuff')).toThrow(
      '[Unreleased]'
    );
  });
});

describe('hasUnreleasedEntries', () => {
  it('returns true when there are entries', () => {
    expect(hasUnreleasedEntries(SAMPLE_CHANGELOG)).toBe(true);
  });

  it('returns false when unreleased is empty template', () => {
    expect(hasUnreleasedEntries(EMPTY_UNRELEASED)).toBe(false);
  });
});
