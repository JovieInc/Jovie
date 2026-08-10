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

import { isInternalEntry } from './changelog-filter-rules';

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

export type ChangelogInlineNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'code'; readonly value: string }
  | {
      readonly type: 'strong';
      readonly children: readonly ChangelogInlineNode[];
    };

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING_RE = /^### (Added|Changed|Fixed|Removed)$/;
const INTERNAL_MARKER_RE = /\[\s*internal\s*\]/i;

function appendInlineText(nodes: ChangelogInlineNode[], value: string): void {
  if (!value) return;
  const previous = nodes.at(-1);
  if (previous?.type === 'text') {
    nodes[nodes.length - 1] = {
      type: 'text',
      value: previous.value + value,
    };
    return;
  }
  nodes.push({ type: 'text', value });
}

function backtickRunLength(value: string, start: number): number {
  let end = start;
  while (value[end] === '`') end += 1;
  return end - start;
}

function findClosingBackticks(
  value: string,
  start: number,
  fenceLength: number
): number {
  let cursor = start;
  while (cursor < value.length) {
    const next = value.indexOf('`', cursor);
    if (next === -1) return -1;
    const runLength = backtickRunLength(value, next);
    if (runLength === fenceLength) return next;
    cursor = next + runLength;
  }
  return -1;
}

function parseInlineNodes(
  value: string,
  allowStrong: boolean
): ChangelogInlineNode[] {
  const nodes: ChangelogInlineNode[] = [];
  let cursor = 0;
  let textStart = 0;

  while (cursor < value.length) {
    if (allowStrong && value.startsWith('**', cursor)) {
      const closingStrong = value.indexOf('**', cursor + 2);
      if (closingStrong !== -1) {
        appendInlineText(nodes, value.slice(textStart, cursor));
        nodes.push({
          type: 'strong',
          children: parseInlineNodes(
            value.slice(cursor + 2, closingStrong),
            false
          ),
        });
        cursor = closingStrong + 2;
        textStart = cursor;
        continue;
      }
    }

    if (value[cursor] === '`') {
      const fenceLength = backtickRunLength(value, cursor);
      const contentStart = cursor + fenceLength;
      const closingBackticks = findClosingBackticks(
        value,
        contentStart,
        fenceLength
      );
      appendInlineText(nodes, value.slice(textStart, cursor));

      if (closingBackticks !== -1) {
        nodes.push({
          type: 'code',
          value: value.slice(contentStart, closingBackticks),
        });
        cursor = closingBackticks + fenceLength;
      } else {
        // A malformed delimiter should never leak Markdown chrome to the UI.
        cursor = contentStart;
      }
      textStart = cursor;
      continue;
    }

    cursor += 1;
  }

  appendInlineText(nodes, value.slice(textStart));
  return nodes;
}

/**
 * Parse the safe inline subset supported by public changelog copy.
 *
 * Strong spans may contain code spans, including entries such as
 * `**Public pitch deck at \`/pitch\`**`. Backtick fences are consumed even when
 * malformed so raw Markdown delimiters never reach the rendered page.
 */
export function parseChangelogInline(value: string): ChangelogInlineNode[] {
  return parseInlineNodes(value, true);
}

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
  return !INTERNAL_MARKER_RE.test(entry) && !isInternalEntry(entry);
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
  let summaryConsumed = false;

  for (const line of lines) {
    const result = processChangelogLine(
      line,
      current,
      currentSection,
      summaryConsumed,
      releases
    );
    current = result.current;
    currentSection = result.currentSection;
    summaryConsumed = result.summaryConsumed;
  }

  return releases.filter(hasPublicEntries);
}

type LineState = {
  current: ChangelogRelease | null;
  currentSection: keyof ChangelogSection | null;
  summaryConsumed: boolean;
};

function tryParseVersion(
  line: string,
  releases: ChangelogRelease[]
): LineState | null {
  const versionResult = parseVersionHeading(line);
  if (versionResult === 'unreleased') {
    return { current: null, currentSection: null, summaryConsumed: false };
  }
  if (versionResult) {
    releases.push(versionResult);
    return {
      current: versionResult,
      currentSection: null,
      summaryConsumed: false,
    };
  }
  return null;
}

function tryParseSummary(
  line: string,
  current: ChangelogRelease,
  currentSection: keyof ChangelogSection | null,
  summaryConsumed: boolean
): LineState | null {
  if (!currentSection && line.startsWith('> ') && !summaryConsumed) {
    const summary = line.slice(2).trim();
    if (!INTERNAL_MARKER_RE.test(summary) && !isInternalEntry(summary)) {
      current.summary = summary;
    }
    return { current, currentSection, summaryConsumed: true };
  }
  return null;
}

function tryParseSection(
  line: string,
  current: ChangelogRelease
): LineState | null {
  const sMatch = SECTION_HEADING_RE.exec(line);
  if (!sMatch) return null;
  return {
    current,
    currentSection: sMatch[1].toLowerCase() as keyof ChangelogSection,
    summaryConsumed: true,
  };
}

function tryParseBullet(
  line: string,
  current: ChangelogRelease,
  currentSection: keyof ChangelogSection | null
): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- ') || !currentSection) return;
  const entry = trimmed.slice(2);
  if (isPublicEntry(entry)) {
    current.sections[currentSection].push(entry);
  }
}

function processChangelogLine(
  line: string,
  current: ChangelogRelease | null,
  currentSection: keyof ChangelogSection | null,
  summaryConsumed: boolean,
  releases: ChangelogRelease[]
): LineState {
  const versionState = tryParseVersion(line, releases);
  if (versionState) return versionState;

  if (!current) return { current, currentSection, summaryConsumed };

  const summaryState = tryParseSummary(
    line,
    current,
    currentSection,
    summaryConsumed
  );
  if (summaryState) return summaryState;

  const sectionState = tryParseSection(line, current);
  if (sectionState) return sectionState;

  tryParseBullet(line, current, currentSection);
  return { current, currentSection, summaryConsumed };
}
