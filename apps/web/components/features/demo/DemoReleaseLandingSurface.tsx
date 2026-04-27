'use client';

import { useSearchParams } from 'next/navigation';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { DemoClientProviders } from './DemoClientProviders';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

const RELEASE = DEMO_RELEASE_VIEW_MODELS[0];
const ARTIST = INTERNAL_DJ_DEMO_PERSONA.profile;
const PROVIDER_ACCENTS: Record<string, string> = {
  spotify: '#1DB954',
  apple_music: '#FA2D48',
  youtube: '#FF0000',
  amazon_music: '#00A8E1',
};
const DEFAULT_PROVIDER_ACCENT = '#5E6AD2';
const DEMO_CREDITS: readonly SmartLinkCreditGroup[] = [
  {
    role: 'producer',
    label: 'Producer',
    entries: [
      {
        artistId: 'credit-producer-1',
        name: ARTIST.displayName,
        handle: ARTIST.handle,
        role: 'producer',
        position: 1,
      },
    ],
  },
] as const;

export function DemoReleaseLandingSurface() {
  const searchParams = useSearchParams();
  const captureMode = searchParams.get('capture');

  if (captureMode === 'creator-menu') {
    return (
      <DemoClientProviders>
        <div data-testid='demo-showcase-release-landing'>
          <div className='flex min-h-screen items-center justify-center bg-[#0b0d12] px-5 py-10'>
            <div
              className='w-full max-w-[340px] rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,#12161f,#0c1017)] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.45)]'
              data-testid='demo-release-creator-capture'
            >
              <div className='rounded-[24px] border border-white/8 bg-white/[0.04] p-4'>
                <p className='text-center text-[12px] font-semibold text-white/45'>
                  Creator activation
                </p>
                <div className='mt-4 rounded-[20px] bg-white/[0.05] px-4 py-5 text-center'>
                  <p className='text-[15px] font-semibold text-white'>
                    {RELEASE.title}
                  </p>
                  <p className='mt-1 text-[12px] text-white/58'>
                    {ARTIST.displayName}
                  </p>
                </div>
                <div className='mt-5 flex justify-center'>
                  <a
                    href={`/${ARTIST.handle}/${RELEASE.slug}/sounds`}
                    className='inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 text-[15px] font-[600] tracking-[-0.02em] text-black'
                  >
                    Use this sound
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DemoClientProviders>
    );
  }

  return (
    <DemoClientProviders>
      <div data-testid='demo-showcase-release-landing'>
        <ReleaseLandingPage
          release={{
            title: RELEASE.title,
            artworkUrl: RELEASE.artworkUrl ?? null,
            releaseDate: RELEASE.releaseDate ?? null,
            previewUrl: RELEASE.previewUrl ?? null,
          }}
          artist={{
            name: ARTIST.displayName,
            handle: ARTIST.handle,
            avatarUrl: ARTIST.avatarSrc,
          }}
          providers={RELEASE.providers.map(provider => ({
            key: provider.key,
            label: provider.label,
            accent: PROVIDER_ACCENTS[provider.key] ?? DEFAULT_PROVIDER_ACCENT,
            url: provider.url,
          }))}
          credits={[...DEMO_CREDITS]}
          soundsUrl={`/${ARTIST.handle}/${RELEASE.slug}/sounds`}
          initialMenuOpen={false}
        />
      </div>
    </DemoClientProviders>
  );
}
