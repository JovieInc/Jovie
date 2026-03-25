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
    const vMatch = VERSION_HEADING_RE.exec(line);
    if (vMatch) {
      const [, version, date] = vMatch;
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        currentSection = null;
        continue;
      }
      current = {
        version,
        date: date || '',
        summary: '',
        sections: { added: [], changed: [], fixed: [], removed: [] },
      };
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
      // Skip internal entries — not meant for public display
      // Also auto-filter entries with vendor names, dev tooling, etc.
      if (!entry.startsWith(INTERNAL_PREFIX) && !isInternalEntry(entry)) {
        current.sections[currentSection].push(entry);
      }
    }
  }

  // Filter out releases with no public entries
  return releases.filter(r => {
    const totalEntries = Object.values(r.sections).reduce(
      (sum, entries) => sum + entries.length,
      0
    );
    return totalEntries > 0;
  });
}
