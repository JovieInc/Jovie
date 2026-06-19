import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_URL } from '@/constants/app';
import { buildPublicProfileMetadata } from '@/lib/profile/metadata';
import {
  loadSeoRatchetBaseline,
  resolveSeoSourcePath,
} from '@/lib/seo/ratchet';

const baseline = loadSeoRatchetBaseline();

describe('SEO ratchet — public profile metadata builder (JOV-11044)', () => {
  it('profile route delegates metadata to buildPublicProfileMetadata', () => {
    const profileSurface = baseline.profileSurfaces.find(
      surface => surface.metadataBuilder === 'buildPublicProfileMetadata'
    );
    expect(profileSurface).toBeDefined();

    const source = readFileSync(
      resolveSeoSourcePath(profileSurface!.sourceFile),
      'utf8'
    );
    expect(source).toContain('buildPublicProfileMetadata');
    expect(source).toContain('export async function generateMetadata');
  });
  it('buildPublicProfileMetadata emits canonical, OG, and Twitter metadata', () => {
    const metadata = buildPublicProfileMetadata({
      profile: {
        username: 'TimWhite',
        username_normalized: 'timwhite',
        display_name: 'Tim White',
        bio: 'Independent artist and founder of Jovie.',
        location: 'Los Angeles',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
        is_verified: true,
      },
      genres: ['Electronic', 'Pop'],
    });

    expect(metadata.title).toBe('Tim White');
    expect(metadata.description).toContain('Jovie');
    expect(metadata.alternates?.canonical).toBe(`${BASE_URL}/timwhite`);
    expect(metadata.openGraph?.title).toContain('Tim White');
    expect(metadata.openGraph?.url).toBe(`${BASE_URL}/timwhite`);
    expect(metadata.twitter?.card).toBe('summary_large_image');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});
