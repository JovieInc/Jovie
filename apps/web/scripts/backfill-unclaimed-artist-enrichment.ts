#!/usr/bin/env tsx

/**
 * Backfill identity enrichment for existing unclaimed structured-credit
 * artist profiles (JOV-6529).
 *
 * Re-runs the bounded provider-ID-backed enrichment pass (MusicFetch →
 * MusicBrainz url-rels) for unclaimed profiles and rewrites the
 * `settings.identityEnrichment` receipt. Idempotent — safe to re-run with
 * the printed `nextCursor`.
 *
 *   pnpm tsx scripts/backfill-unclaimed-artist-enrichment.ts            # dry-run
 *   pnpm tsx scripts/backfill-unclaimed-artist-enrichment.ts --apply
 */

import { pathToFileURL } from 'node:url';
import { and, asc, sql as drizzleSql, eq, gt, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { backfillUnclaimedArtistIdentities } from '@/lib/discography/unclaimed-artist-enrichment';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Args {
  readonly dryRun: boolean;
  readonly limit: number;
  readonly cursor: string | null;
}

export function parseArgs(argv: readonly string[]): Args {
  let dryRun = true;
  let limit = DEFAULT_LIMIT;
  let cursor: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--') continue;
    if (value === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (value === '--apply') {
      dryRun = false;
      continue;
    }
    if (value === '--limit') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        throw new Error(
          `--limit must be an integer between 1 and ${MAX_LIMIT}.`
        );
      }
      limit = parsed;
      index += 1;
      continue;
    }
    if (value === '--cursor') {
      const next = argv[index + 1];
      if (!next || !UUID_PATTERN.test(next)) {
        throw new Error('--cursor requires a valid UUID.');
      }
      cursor = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  return { dryRun, limit, cursor };
}

async function dryRunSummary(limit: number, cursor: string | null) {
  const profiles = await db
    .select({ id: creatorProfiles.id, spotifyId: creatorProfiles.spotifyId })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isClaimed, false),
        isNotNull(creatorProfiles.spotifyId),
        drizzleSql`${creatorProfiles.settings}->'unclaimedArtistProfile'->>'state' = 'unclaimed'`,
        ...(cursor ? [gt(creatorProfiles.id, cursor)] : [])
      )
    )
    .orderBy(asc(creatorProfiles.id))
    .limit(limit);

  return {
    mode: 'dry-run' as const,
    scanned: profiles.length,
    candidates: profiles.map(profile => profile.id),
    nextCursor:
      profiles.length === limit ? (profiles.at(-1)?.id ?? null) : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = args.dryRun
    ? await dryRunSummary(args.limit, args.cursor)
    : await backfillUnclaimedArtistIdentities({
        limit: args.limit,
        cursor: args.cursor,
      });
  console.log(JSON.stringify(summary, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(error => {
    console.error('Unclaimed artist enrichment backfill failed:', error);
    process.exit(1);
  });
}
