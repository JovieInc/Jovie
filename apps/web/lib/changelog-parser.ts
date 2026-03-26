/**
 * Shared Changelog Parser (TypeScript)
 *
 * Single source of truth for parsing CHANGELOG.md in the Next.js app.
 * Used by: /changelog page (server component) and /changelog/feed.xml (route handler).
 *
 * Supports two public-facing conventions:
 * - **Summary blockquote**: A `> ...` line immediately after the version heading
 *   is captured as `summary` (plain text, blockquote marker stripped).
 * - **`[internal]` entries**: Bullet entries starting with `[internal]` are
 *   excluded from the parsed output — they're for developer reference only.
 * - **Auto-filter**: Entries matching vendor names, dev tooling, or infrastructure
 *   patterns are automatically excluded even without the `[internal]` prefix.
 */

import { isInternalEntry } from '../../../scripts/lib/changelog-filter-rules.mjs';

export interface ChangelogSection {
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  summary: string;
  sections: ChangelogSection;
}

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING_RE = /^### (Added|Changed|Fixed|Removed)$/;
const INTERNAL_PREFIX = '[internal]';

/** Try to parse a version heading; returns a new release or 'unreleased' sentinel. */
function parseVersionHeading(
  line: string
): ChangelogRelease | 'unreleased' | null {
  const match = VERSION_HEADING_RE.exec(line);
  if (!match) return null;
  const [, version, date] = match;
  if (version.toLowerCase() === 'unreleased') return 'unreleased';
  return {
    version,
    date: date || '',
    summary: '',
    sections: { added: [], changed: [], fixed: [], removed: [] },
  };
}

/** Check if a bullet entry should be included in public output. */
function isPublicEntry(entry: string): boolean {
  return !entry.startsWith(INTERNAL_PREFIX) && !isInternalEntry(entry);
}

/** Returns true when a release has at least one public entry. */
function hasPublicEntries(release: ChangelogRelease): boolean {
  return Object.values(release.sections).some(entries => entries.length > 0);
}

/**
 * Parse CHANGELOG.md into structured release data for public display.
 *
 * Filters out `[internal]` entries and releases with zero public entries.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.split('\n');
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let currentSection: keyof ChangelogSection | null = null;

  for (const line of lines) {
    const versionResult = parseVersionHeading(line);
    if (versionResult === 'unreleased') {
      current = null;
      currentSection = null;
      continue;
    }
    if (versionResult) {
      current = versionResult;
      releases.push(current);
      currentSection = null;
      continue;
    }

    if (!current) continue;

    // Capture summary blockquote (before any section heading)
    if (!currentSection && line.startsWith('> ') && !current.summary) {
      current.summary = line.slice(2).trim();
      continue;
    }

    const sMatch = SECTION_HEADING_RE.exec(line);
    if (sMatch) {
      currentSection = sMatch[1].toLowerCase() as keyof ChangelogSection;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && currentSection) {
      const entry = trimmed.slice(2);
      if (isPublicEntry(entry)) {
        current.sections[currentSection].push(entry);
      }
    }
  }

  return releases.filter(hasPublicEntries);
}
