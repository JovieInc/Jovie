import fs from 'node:fs';
import { unstable_cache } from 'next/cache';
import { type ChangelogRelease, parseChangelog } from './changelog-parser';
import { resolveMonorepoPath } from './filesystem-paths';

function resolveChangelogPath(): string | null {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');
  return fs.existsSync(changelogPath) ? changelogPath : null;
}

export const getChangelogReleases = unstable_cache(
  async (): Promise<ChangelogRelease[]> => {
    const changelogPath = resolveChangelogPath();
    if (!changelogPath) return [];
    try {
      return parseChangelog(fs.readFileSync(changelogPath, 'utf8'));
    } catch {
      return [];
    }
  },
  ['changelog-releases'],
  { revalidate: false, tags: ['changelog'] }
);
