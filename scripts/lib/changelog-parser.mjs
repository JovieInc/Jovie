/**
 * Shared Changelog Parser
 *
 * Single source of truth for parsing CHANGELOG.md across the project.
 * Used by: send-changelog-email.mjs and the /changelog page (server component).
 */

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING_RE = /^### (Added|Changed|Fixed|Removed)$/;
const INTERNAL_PREFIX = '[internal]';

/**
 * Parse a full CHANGELOG.md into structured data.
 *
 * Supports two public-facing conventions:
 * - **Summary blockquote**: A `> ...` line immediately after the version heading
 *   is captured as `summary` (plain text, blockquote marker stripped).
 * - **`[internal]` entries**: Bullet entries starting with `[internal]` are
 *   separated into `internalSections` and excluded from `sections`.
 *
 * @param {string} markdown - Raw CHANGELOG.md content
 * @returns {{ unreleased: { raw: string, summary: string, sections: Record<string, string[]>, internalSections: Record<string, string[]> }, releases: Array<{ version: string, date: string, raw: string, summary: string, sections: Record<string, string[]>, internalSections: Record<string, string[]> }> }}
 */
export function parseChangelog(markdown) {
  const lines = markdown.split('\n');
  const releases = [];
  const unreleased = {
    raw: '',
    summary: '',
    sections: {},
    internalSections: {},
  };
  let currentBlock = null; // null | 'unreleased' | index into releases
  let currentSection = null;

  for (const line of lines) {
    const versionMatch = line.match(VERSION_HEADING_RE);

    if (versionMatch) {
      const [, version, date] = versionMatch;
      currentSection = null;

      if (version.toLowerCase() === 'unreleased') {
        currentBlock = 'unreleased';
      } else {
        currentBlock = releases.length;
        releases.push({
          version,
          date: date || '',
          raw: '',
          summary: '',
          sections: {},
          internalSections: {},
        });
      }
      continue;
    }

    if (currentBlock === null) continue;

    const target =
      currentBlock === 'unreleased' ? unreleased : releases[currentBlock];

    // Capture summary blockquote (first `> ` line before any section heading)
    if (!currentSection && line.startsWith('> ') && !target.summary) {
      target.summary = line.slice(2).trim();
      target.raw += line + '\n';
      continue;
    }

    const sectionMatch = line.match(SECTION_HEADING_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      if (!target.sections[currentSection]) {
        target.sections[currentSection] = [];
      }
      if (!target.internalSections[currentSection]) {
        target.internalSections[currentSection] = [];
      }
      continue;
    }

    // Collect raw content
    target.raw += line + '\n';

    // Collect bullet entries, separating internal from public
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && currentSection) {
      const entry = trimmed.slice(2);
      if (entry.startsWith(INTERNAL_PREFIX)) {
        target.internalSections[currentSection].push(
          entry.slice(INTERNAL_PREFIX.length).trim()
        );
      } else {
        target.sections[currentSection].push(entry);
      }
    }
  }

  // Trim trailing newlines from raw
  unreleased.raw = unreleased.raw.trimEnd();
  for (const r of releases) {
    r.raw = r.raw.trimEnd();
  }

  return { unreleased, releases };
}

/**
 * Get the latest (first) release after [Unreleased].
 *
 * @param {string} markdown
 * @returns {{ version: string, date: string, raw: string, sections: Record<string, string[]> } | null}
 */
export function getLatestRelease(markdown) {
  const { releases } = parseChangelog(markdown);
  return releases[0] || null;
}
