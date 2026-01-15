import {
  type FeaturedCreator,
  getFeaturedCreators,
} from '@/lib/featured-creators';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

// Fallback avatars when DB has fewer than minimum
const FALLBACK_AVATARS: FeaturedCreator[] = [
  {
    id: 'fallback-1',
    handle: 'billie-eilish',
    name: 'Artist',
    src: '/images/avatars/billie-eilish.jpg',
  },
  {
    id: 'fallback-2',
    handle: 'dua-lipa',
    name: 'Artist',
    src: '/images/avatars/dua-lipa.jpg',
  },
  {
    id: 'fallback-3',
    handle: 'taylor-swift',
    name: 'Artist',
    src: '/images/avatars/taylor-swift.jpg',
  },
  {
    id: 'fallback-4',
    handle: 'the-1975',
    name: 'Artist',
    src: '/images/avatars/the-1975.jpg',
  },
  {
    id: 'fallback-5',
    handle: 'ed-sheeran',
    name: 'Artist',
    src: '/images/avatars/ed-sheeran.jpg',
  },
  {
    id: 'fallback-6',
    handle: 'lady-gaga',
    name: 'Artist',
    src: '/images/avatars/lady-gaga.jpg',
  },
  {
    id: 'fallback-7',
    handle: 'john-mayer',
    name: 'Artist',
    src: '/images/avatars/john-mayer.jpg',
  },
  {
    id: 'fallback-8',
    handle: 'coldplay',
    name: 'Artist',
    src: '/images/avatars/coldplay.jpg',
  },
  {
    id: 'fallback-9',
    handle: 'maneskin',
    name: 'Artist',
    src: '/images/avatars/maneskin.jpg',
  },
  {
    id: 'fallback-10',
    handle: 'placeholder',
    name: 'Artist',
    src: '/images/avatars/placeholder.jpg',
  },
];

const MIN_CREATORS = 10;

/**
 * Server component that fetches featured creators from the database.
 * Falls back to example avatars when fewer than MIN_CREATORS are available.
 * Data is cached for 1 week via unstable_cache in getFeaturedCreators.
 */
export async function SeeItInAction() {
  // Fetch from DB (cached 1 week via unstable_cache)
  const dbCreators = await getFeaturedCreators();

  // Fill gaps with fallbacks if fewer than minimum
  let creators: FeaturedCreator[] = dbCreators;
  if (dbCreators.length < MIN_CREATORS) {
    const needed = MIN_CREATORS - dbCreators.length;
    const usedIds = new Set(dbCreators.map(c => c.id));
    const fallbacks = FALLBACK_AVATARS.filter(f => !usedIds.has(f.id)).slice(
      0,
      needed
    );
    creators = [...dbCreators, ...fallbacks];
  }

  return <SeeItInActionCarousel creators={creators} />;
}
