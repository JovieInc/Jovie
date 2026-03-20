/**
 * Shared Changelog Parser
 *
 * Single source of truth for parsing CHANGELOG.md across the project.
 * Used by: send-changelog-email.mjs and the /changelog page (server component).
 */

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING_RE = /^### (Added|Changed|Fixed|Removed)$/;

/**
 * Parse a full CHANGELOG.md into structured data.
 *
 * @param {string} markdown - Raw CHANGELOG.md content
 * @returns {{ unreleased: { raw: string, sections: Record<string, string[]> }, releases: Array<{ version: string, date: string, raw: string, sections: Record<string, string[]> }> }}
 */
export function parseChangelog(markdown) {
  const lines = markdown.split('\n');
  const releases = [];
  const unreleased = { raw: '', sections: {} };
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
        releases.push({ version, date: date || '', raw: '', sections: {} });
      }
      continue;
    }

    if (currentBlock === null) continue;

    const sectionMatch = line.match(SECTION_HEADING_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      const target =
        currentBlock === 'unreleased' ? unreleased : releases[currentBlock];
      if (!target.sections[currentSection]) {
        target.sections[currentSection] = [];
      }
      continue;
    }

    // Collect raw content
    const target =
      currentBlock === 'unreleased' ? unreleased : releases[currentBlock];
    target.raw += line + '\n';

    // Collect bullet entries
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && currentSection) {
      target.sections[currentSection].push(trimmed.slice(2));
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
