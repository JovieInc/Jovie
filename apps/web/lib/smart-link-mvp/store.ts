import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { discogRecordings } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type SmartLinkProviderRow,
  smartLinks,
} from '@/lib/db/schema/smart-links';
import type { SmartLinkStore, StoredLink } from './types';

const ANONYMOUS_QUOTA_CONSTRAINT = 'smart_links_anonymous_month_slot_unique';

function stored(row: typeof smartLinks.$inferSelect): StoredLink {
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
    async countAnonymousInMonth(subjectHash, month) {
      const [row] = await db
        .select({ total: drizzleSql<number>`count(*)::int` })
        .from(smartLinks)
        .where(
          and(
            eq(smartLinks.anonymousSubjectHash, subjectHash),
            eq(smartLinks.anonymousMonth, month)
          )
        );
      return Number(row?.total ?? 0);
    },
    async insertWithQuota(row) {
      const slots = row.anonymousSubjectHash ? [0, 1, 2] : [null];
      for (const anonymousSlot of slots) {
        try {
          const [inserted] = await db
            .insert(smartLinks)
            .values({
              ...row,
              providers: [...row.providers] as SmartLinkProviderRow[],
              anonymousSlot,
            })
            .returning();
          if (!inserted) throw new Error('Smart link insert returned no row');
          return stored(inserted);
        } catch (error) {
          if (
            row.anonymousSubjectHash &&
            isUniqueViolation(error, ANONYMOUS_QUOTA_CONSTRAINT)
          ) {
            continue;
          }
          if (isUniqueViolation(error)) return 'conflict';
          throw error;
        }
      }
      return 'conflict';
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
