/**
 * Changelog parser for the Node.js publishing pipeline.
 *
 * Used by: send-changelog-email.mjs (via getLatestRelease). The public web
 * app does NOT use this module — it parses through the typed parser at
 * apps/web/lib/changelog-parser.ts instead.
 *
 * Intentional divergence from the web parser: `### Featured` is not
 * recognized by default, because the product-update email format is
 * founder-approved and currently drops Featured entries. Pass
 * `{ includeFeatured: true }` to collect Featured into `sections.featured`
 * the way the web parser does. Never enable it on the email path without
 * founder sign-off — and note the email renderer (entriesToHtml /
 * entriesToText in send-changelog-email.mjs) only renders
 * added/changed/fixed/removed regardless.
 */

import { isInternalEntry } from './changelog-filter-rules.mjs';

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SECTION_HEADING_RE = /^### (Added|Changed|Fixed|Removed)$/;
const FEATURED_SECTION_HEADING_RE =
  /^### (Featured|Added|Changed|Fixed|Removed)$/;
const INTERNAL_MARKER_RE = /\[\s*internal\s*\]/i;

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
 * @param {{ includeFeatured?: boolean }} [options] - `includeFeatured`
 *   recognizes `### Featured` as a section (default false; see file header).
 * @returns {{ unreleased: { raw: string, summary: string, sections: Record<string, string[]>, internalSections: Record<string, string[]> }, releases: Array<{ version: string, date: string, raw: string, summary: string, sections: Record<string, string[]>, internalSections: Record<string, string[]>, kind: 'daily' | 'release' }> }}
 */
export function parseChangelog(markdown, { includeFeatured = false } = {}) {
  const sectionHeadingRe = includeFeatured
    ? FEATURED_SECTION_HEADING_RE
    : SECTION_HEADING_RE;
  const lines = markdown.split('\n');
  /** @type {Array<{ version: string, date: string, raw: string, summary: string, sections: Record<string, string[]>, internalSections: Record<string, string[]>, kind: 'daily' | 'release' }>} */
  const releases = [];
  const unreleased = {
    raw: '',
    summary: '',
    sections: {},
    internalSections: {},
  };
  let currentBlock = null; // null | 'unreleased' | index into releases
  let currentSection = null;
  let summaryConsumed = false;

  for (const line of lines) {
    const versionMatch = line.match(VERSION_HEADING_RE);

    if (versionMatch) {
      const [, version, date] = versionMatch;
      currentSection = null;
      summaryConsumed = false;

      if (version.toLowerCase() === 'unreleased') {
        currentBlock = 'unreleased';
      } else {
        // Date-keyed headings are daily digests (JOV-5762): stable date
        // permalinks, no fake `v` prefix, invisible to CalVer version-check.
        const daily =
          DATE_KEY_RE.test(version) &&
          !Number.isNaN(Date.parse(`${version}T00:00:00Z`)) &&
          new Date(`${version}T00:00:00Z`).toISOString().slice(0, 10) ===
            version;
        currentBlock = releases.length;
        releases.push({
          version,
          date: daily ? version : date || '',
          raw: '',
          summary: '',
          sections: {},
          internalSections: {},
          kind: /** @type {'daily' | 'release'} */ (
            daily ? 'daily' : 'release'
          ),
        });
      }
      continue;
    }

    if (currentBlock === null) continue;

    const target =
      currentBlock === 'unreleased' ? unreleased : releases[currentBlock];

    // Capture summary blockquote (first `> ` line before any section heading)
    if (!currentSection && line.startsWith('> ') && !summaryConsumed) {
      summaryConsumed = true;
      const summary = line.slice(2).trim();
      if (!INTERNAL_MARKER_RE.test(summary) && !isInternalEntry(summary)) {
        target.summary = summary;
      }
      target.raw += line + '\n';
      continue;
    }

    const sectionMatch = line.match(sectionHeadingRe);
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
      if (INTERNAL_MARKER_RE.test(entry)) {
        target.internalSections[currentSection].push(entry);
      } else if (isInternalEntry(entry)) {
        // Auto-filtered: vendor names, dev tooling, infrastructure patterns
        target.internalSections[currentSection].push(entry);
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
 * @returns {{ version: string, date: string, raw: string, sections: Record<string, string[]>, kind: 'daily' | 'release' } | null}
 */
export function getLatestRelease(markdown) {
  const { releases } = parseChangelog(markdown);
  return releases[0] || null;
}
