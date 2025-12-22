import { and, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { transformImageUrl } from '@/lib/images/versioning';

export type FeaturedCreator = {
  id: string;
  handle: string;
  name: string;
  src: string;
};

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function queryFeaturedCreators(): Promise<FeaturedCreator[]> {
  if (!(await doesTableExist(TABLE_NAMES.creatorProfiles))) {
    return [];
  }

  const data = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      creatorType: creatorProfiles.creatorType,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        eq(creatorProfiles.isFeatured, true),
        eq(creatorProfiles.marketingOptOut, false)
      )
    )
    .orderBy(creatorProfiles.displayName)
    .limit(12);

  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  return shuffle(
    data.map(a => ({
      id: a.id,
      handle: a.username,
      name: a.displayName || a.username,
      src: transformImageUrl(a.avatarUrl || '/android-chrome-192x192.png', {
        width: 256,
        height: 256,
        quality: 70,
        format: 'webp',
        crop: 'fill',
        gravity: 'face',
      }),
    })),
    seed
  );
}

export const getFeaturedCreators = unstable_cache(
  queryFeaturedCreators,
  ['featured-creators'],
  {
    revalidate: 60 * 60 * 24 * 7,
    tags: ['featured-creators'],
  }
);
