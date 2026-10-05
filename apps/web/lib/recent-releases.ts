import fs from 'node:fs';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';

// Lightweight CHANGELOG.md reader for the homepage Recently Shipped section
// (build-time only). Storybook aliases this module to a fixture mock because
// node:fs cannot load in the browser.

export interface CompactRelease {
  readonly version: string;
  readonly date: string;
  readonly highlights: readonly string[];
}

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;

export function parseRecentReleases(
  markdown: string,
  count = 3
): CompactRelease[] {
  const lines = markdown.split('\n');
  const releases: { version: string; date: string; highlights: string[] }[] =
    [];
  let current: (typeof releases)[number] | null = null;

  for (const line of lines) {
    if (releases.length >= count) break;

    const vMatch = VERSION_HEADING_RE.exec(line);
    if (vMatch) {
      const [, version, date] = vMatch;
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        continue;
      }
      current = { version, date: date || '', highlights: [] };
      releases.push(current);
      continue;
    }

    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && current.highlights.length < 3) {
      current.highlights.push(trimmed.slice(2));
    }
  }

  return releases;
}

export function readRecentReleases(count = 3): CompactRelease[] {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) return [];
  return parseRecentReleases(fs.readFileSync(changelogPath, 'utf8'), count);
}
