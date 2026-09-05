import fs from 'node:fs';
import { unstable_cache } from 'next/cache';
import { type ChangelogRelease, parseChangelog } from './changelog-parser';
import { resolveMonorepoPath } from './filesystem-paths';

function resolveChangelogPath(): string | null {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');
  return fs.existsSync(changelogPath) ? changelogPath : null;
}

const getChangelogMarkdown = unstable_cache(
  async (): Promise<string> => {
    const changelogPath = resolveChangelogPath();
    if (!changelogPath) return '';
    try {
      return fs.readFileSync(changelogPath, 'utf8');
    } catch {
      return '';
    }
  },
  ['changelog-markdown'],
  { revalidate: false, tags: ['changelog'] }
);

// Cache source bytes, not policy decisions: safety rules must apply on every read.
export async function getChangelogReleases(): Promise<ChangelogRelease[]> {
  return parseChangelog(await getChangelogMarkdown());
}
