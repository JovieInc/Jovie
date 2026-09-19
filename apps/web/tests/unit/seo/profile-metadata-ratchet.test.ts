import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_URL } from '@/constants/app';
import {
  buildProfileAeoContent,
  buildProfileAeoFaqStructuredData,
  validateProfileAeoContent,
} from '@/lib/profile/aeo-content';
import { buildPublicProfileMetadata } from '@/lib/profile/metadata';
import {
  loadSeoRatchetBaseline,
  resolveSeoSourcePath,
} from '@/lib/seo/ratchet';
import type { Artist } from '@/types/db';

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

  it('emits noindex metadata for the production canary identity', () => {
    const metadata = buildPublicProfileMetadata({
      profile: {
        username: 'TestArtist',
        username_normalized: 'testartist',
        display_name: 'Test Artist',
        bio: 'Synthetic production canary',
        location: null,
        avatar_url: null,
        is_verified: false,
      },
      genres: [],
    });

    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });

  it('consumes retrieval-ready AEO validation for independently extracted facts', () => {
    const profileSurface = baseline.profileSurfaces.find(
      surface => surface.id === 'public-profile'
    );
    expect(profileSurface).toBeDefined();

    const pageSource = readFileSync(
      resolveSeoSourcePath(profileSurface!.sourceFile),
      'utf8'
    );
    expect(pageSource).toContain('buildProfileAeoContent');
    expect(pageSource).toContain(
      'buildProfileAeoFaqStructuredData(aeoContent)'
    );
    expect(pageSource).toContain('<ProfileAeoContent');

    const artist = {
      id: 'artist-ratchet',
      owner_user_id: 'owner-ratchet',
      handle: 'tim',
      name: 'Tim White',
      tagline: 'Independent artist and founder of Jovie.',
      location: 'Los Angeles',
      hometown: null,
      active_since_year: 2018,
      genres: ['Electronic'],
      published: true,
      is_verified: true,
      is_featured: false,
      marketing_opt_out: false,
      created_at: '2024-01-01T00:00:00.000Z',
    } as Artist;

    const content = buildProfileAeoContent({
      artist,
      genres: ['Electronic'],
      latestRelease: {
        title: 'Never Say A Word',
        slug: 'never-say-a-word',
        releaseType: 'single',
        releaseDate: '2024-06-01T00:00:00.000Z',
      },
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(validateProfileAeoContent(content)).toEqual([]);
    expect(
      content.descriptionBlocks.every(block => block.text.includes('Tim White'))
    ).toBe(true);
    expect(buildProfileAeoFaqStructuredData(content).mainEntity).toEqual(
      content.faqs.map(faq => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      }))
    );
  });
});
