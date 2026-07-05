import type { Metadata } from 'next';
import { buildPublicProfileMetadata } from '@/lib/profile/metadata';
import type { CreatorProfile } from '@/types/db';

export interface SeoStaticRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly loadMetadata: () => Promise<Metadata>;
}

const PROFILE_FIXTURE: Pick<
  CreatorProfile,
  | 'username'
  | 'username_normalized'
  | 'display_name'
  | 'bio'
  | 'location'
  | 'avatar_url'
  | 'is_verified'
> = {
  username: 'dualipa',
  username_normalized: 'dualipa',
  display_name: 'Dua Lipa',
  bio: 'Grammy-winning pop artist.',
  location: 'London',
  avatar_url: 'https://cdn.example.com/avatar.jpg',
  is_verified: true,
};

/**
 * SEO-critical routes whose metadata is linted in CI via the ratchet baseline.
 * Dynamic slug routes use representative fixtures; static pages import directly.
 */
export const SEO_STATIC_ROUTE_MANIFEST: readonly SeoStaticRouteDefinition[] = [
  {
    id: 'home',
    path: '/',
    loadMetadata: async () => {
      const { generateMetadata } = await import('@/app/(home)/page');
      return generateMetadata();
    },
  },
  {
    id: 'artist-profiles',
    path: '/artist-profiles',
    loadMetadata: async () => {
      const { metadata } = await import(
        '@/app/(marketing)/artist-profiles/page'
      );
      return metadata;
    },
  },
  {
    id: 'artist-profile-landing',
    path: '/artist-profile',
    loadMetadata: async () => {
      const { metadata } = await import(
        '@/app/(marketing)/artist-profile/page'
      );
      return metadata;
    },
  },
  {
    id: 'download',
    path: '/download',
    loadMetadata: async () => {
      const { metadata } = await import('@/app/(marketing)/download/page');
      return metadata;
    },
  },
  {
    id: 'profile-root',
    path: '/dualipa',
    loadMetadata: async () =>
      buildPublicProfileMetadata({
        profile: PROFILE_FIXTURE,
        genres: ['Pop'],
      }),
  },
];

/**
 * Profile/asset routes that must emit JSON-LD in source (AEO surface #11032).
 */
export const SEO_JSON_LD_SOURCE_ROUTES = [
  'app/[username]/page.tsx',
  'app/[username]/[slug]/page.tsx',
  'app/[username]/[slug]/[trackSlug]/page.tsx',
] as const;
