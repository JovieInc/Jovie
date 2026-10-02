import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type SmartLinkProviderRow,
  smartLinks,
} from '@/lib/db/schema/smart-links';
import type { LinkProvider } from './contract';
import type { SmartLinkStore, StoredLink } from './types';

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (record.code === '23505') return true;
    if (
      typeof record.message === 'string' &&
      /duplicate key|unique/i.test(record.message)
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function stored(row: {
  code: string;
  query: string;
  kind: string;
  title: string | null;
  artistName: string | null;
  artworkUrl: string | null;
  providers: SmartLinkProviderRow[];
  isrc: string | null;
  upc: string | null;
  providerKey: string | null;
  createdByUserId: string | null;
}): StoredLink {
  return {
    code: row.code,
    query: row.query,
    kind: row.kind === 'artist' ? 'artist' : 'track',
    title: row.title,
    artistName: row.artistName,
    artworkUrl: row.artworkUrl,
    providers: row.providers,
    isrc: row.isrc,
    upc: row.upc,
    providerKey: row.providerKey,
    createdByUserId: row.createdByUserId,
  };
}

export function createSmartLinkStore(): SmartLinkStore {
  return {
    async findByIsrc(isrc) {
      const [row] = await db
        .select()
        .from(smartLinks)
        .where(eq(smartLinks.isrc, isrc))
        .limit(1);
      return row ? stored(row) : null;
    },
    async findByProviderKey(providerKey) {
      const [row] = await db
        .select()
        .from(smartLinks)
        .where(eq(smartLinks.providerKey, providerKey))
        .limit(1);
      return row ? stored(row) : null;
    },
    async findCanonical(input) {
      if (!input.isrc) return null;
      const [row] = await db
        .select({
          slug: discogRecordings.slug,
          title: discogRecordings.title,
          username: creatorProfiles.usernameNormalized,
          artist: creatorProfiles.displayName,
          isPublic: creatorProfiles.isPublic,
        })
        .from(discogRecordings)
        .innerJoin(
          creatorProfiles,
          eq(creatorProfiles.id, discogRecordings.creatorProfileId)
        )
        .where(
          and(
            eq(discogRecordings.isrc, input.isrc),
            eq(creatorProfiles.isPublic, true)
          )
        )
        .limit(1);
      if (!row?.username) return null;
      return {
        pageUrl: `${BASE_URL}/${row.username}/${row.slug}`,
        title: row.title,
        artist: row.artist,
        artworkUrl: null,
      };
    },
    async countAnonymousSince(subjectHash, since) {
      const [row] = await db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(smartLinks)
        .where(
          and(
            eq(smartLinks.anonymousSubjectHash, subjectHash),
            gte(smartLinks.createdAt, since)
          )
        );
      return Number(row?.total ?? 0);
    },
    async insert(row) {
      try {
        const [inserted] = await db
          .insert(smartLinks)
          .values({
            code: row.code,
            query: row.query,
            kind: row.kind,
            title: row.title,
            artistName: row.artistName,
            artworkUrl: row.artworkUrl,
            providers: [...row.providers] as SmartLinkProviderRow[],
            isrc: row.isrc,
            upc: row.upc,
            providerKey: row.providerKey,
            createdByUserId: row.createdByUserId,
            anonymousSubjectHash: row.anonymousSubjectHash,
          })
          .returning();
        if (!inserted) return 'conflict';
        return stored(inserted);
      } catch (error) {
        if (isUniqueViolation(error)) return 'conflict';
        throw error;
      }
    },
  };
}

export async function findSmartLinkByCode(
  code: string
): Promise<StoredLink | null> {
  const [row] = await db
    .select()
    .from(smartLinks)
    .where(eq(smartLinks.code, code))
    .limit(1);
  return row ? stored(row) : null;
}

export async function recordSmartLinkClick(code: string): Promise<void> {
  await db
    .update(smartLinks)
    .set({
      clickCount: sql`${smartLinks.clickCount} + 1`,
    })
    .where(eq(smartLinks.code, code));
}

export type { LinkProvider };
