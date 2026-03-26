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
interface ParseState {
  current: ChangelogRelease | null;
  currentSection: keyof ChangelogSection | null;
}

/** Process a single line and update parse state. Returns the new release if one was started. */
function processLine(line: string, state: ParseState): ChangelogRelease | null {
  const versionResult = parseVersionHeading(line);
  if (versionResult === 'unreleased') {
    state.current = null;
    state.currentSection = null;
    return null;
  }
  if (versionResult) {
    state.current = versionResult;
    state.currentSection = null;
    return versionResult;
  }

  if (!state.current) return null;

  if (
    !state.currentSection &&
    line.startsWith('> ') &&
    !state.current.summary
  ) {
    state.current.summary = line.slice(2).trim();
    return null;
  }

  const sMatch = SECTION_HEADING_RE.exec(line);
  if (sMatch) {
    state.currentSection = sMatch[1].toLowerCase() as keyof ChangelogSection;
    return null;
  }

  const trimmed = line.trim();
  if (trimmed.startsWith('- ') && state.currentSection) {
    const entry = trimmed.slice(2);
    if (isPublicEntry(entry)) {
      state.current.sections[state.currentSection].push(entry);
    }
  }
  return null;
}

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.split('\n');
  const releases: ChangelogRelease[] = [];
  const state: ParseState = { current: null, currentSection: null };

  for (const line of lines) {
    const newRelease = processLine(line, state);
    if (newRelease) releases.push(newRelease);
  }

  return releases.filter(hasPublicEntries);
}
