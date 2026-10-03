import fs from 'node:fs';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { RecentlyShippedReleases } from './RecentlyShippedReleases';

// ---------------------------------------------------------------------------
// Lightweight changelog parser (build-time only)
// ---------------------------------------------------------------------------

interface ParsedRelease {
  version: string;
  date: string;
  highlights: string[];
}

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;

function parseRecentReleases(markdown: string, count = 3): ParsedRelease[] {
  const lines = markdown.split('\n');
  const releases: ParsedRelease[] = [];
  let current: ParsedRelease | null = null;

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentlyShippedSection() {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');

  let markdown = '';
  if (fs.existsSync(changelogPath)) {
    markdown = fs.readFileSync(changelogPath, 'utf8');
  }

  const releases = parseRecentReleases(markdown, 3);
  return <RecentlyShippedReleases releases={releases} />;
}
