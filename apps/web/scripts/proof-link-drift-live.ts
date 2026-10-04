/**
 * `pnpm proof:link-drift -- <handle> [<handle> ...]` (JOV-7750).
 *
 * Read-only live run of the link-drift computed proof against real public
 * profiles. Stored link-in-bio links come from production `leads` through
 * `scripts/db/prod-read.mjs` (BEGIN READ ONLY). The catalog comes from the
 * official Spotify API; bio link targets get one polite HEAD each. Nothing
 * is written anywhere. Prints the findings as JSON.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLinkDrift } from '@/lib/proof/link-drift';
import { buildLinkDriftInput } from '@/lib/proof/link-drift.server';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROD_READ = path.resolve(HERE, '../../../scripts/db/prod-read.mjs');
const HANDLE = /^[a-z0-9._-]{1,64}$/u;

function readLead(handle: string) {
  const sql = `select json_build_object('url', linktree_url, 'links', all_links, 'updatedAt', updated_at, 'spotifyUrl', spotify_url) from leads where linktree_handle = '${handle}' order by updated_at desc limit 1`;
  const output = execFileSync('node', [PROD_READ, sql], { encoding: 'utf8' });
  const row = output.split('\n').find(line => line.startsWith('{'));
  if (!row) return null;
  return JSON.parse(row) as {
    url: string;
    links: { url?: string; title?: string }[] | null;
    updatedAt: string;
    spotifyUrl: string | null;
  };
}

async function main(): Promise<void> {
  const handles = process.argv.slice(2).filter(arg => arg !== '--');
  const results: unknown[] = [];
  for (const handle of handles) {
    if (!HANDLE.test(handle)) throw new Error(`invalid handle ${handle}`);
    const lead = readLead(handle);
    if (!lead) {
      results.push({ handle, error: 'no stored link-in-bio page' });
      continue;
    }
    const input = await buildLinkDriftInput({
      bioPageUrl: lead.url,
      bioFetchedAt: new Date(lead.updatedAt).toISOString(),
      bioLinks: (lead.links ?? []).flatMap(link =>
        typeof link.url === 'string'
          ? [{ url: link.url, title: link.title ?? null }]
          : []
      ),
      dspProfiles: lead.spotifyUrl
        ? [{ platform: 'spotify', url: lead.spotifyUrl }]
        : [],
    });
    results.push({
      handle,
      bioObservedAt: input.bioFetchedAt,
      bioLinks: input.bioLinks.length,
      catalogReleases: input.catalog.length,
      catalogSource: input.catalogSource,
      linkedReleases: input.linkedReleases.map(item => ({
        title: item.release.title,
        releaseDate: item.release.releaseDate,
      })),
      health: input.health.map(item => ({
        url: item.url,
        status: item.status,
        httpStatus: item.httpStatus ?? null,
      })),
      findings: detectLinkDrift(input),
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
