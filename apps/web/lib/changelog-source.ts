import fs from 'node:fs';
import { unstable_cache } from 'next/cache';
import {
  type ChangelogParseResult,
  type ChangelogRelease,
  parseChangelog,
  parseChangelogDocument,
} from './changelog-parser';
import { resolveMonorepoPath } from './filesystem-paths';

function resolveChangelogPath(): string | null {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');
  return fs.existsSync(/* turbopackIgnore: true */ changelogPath)
    ? changelogPath
    : null;
}

const getChangelogMarkdown = unstable_cache(
  async (): Promise<string> => {
    const changelogPath = resolveChangelogPath();
    if (!changelogPath) return '';
    try {
      return fs.readFileSync(/* turbopackIgnore: true */ changelogPath, 'utf8');
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

/**
 * Read the same cached source bytes with publication metadata. The public
 * release list remains filtered; the metadata lets customer surfaces explain
 * newer empty release slots without treating them as shipped updates.
 */
export async function getChangelogSnapshot(): Promise<ChangelogParseResult> {
  return parseChangelogDocument(await getChangelogMarkdown());
}
