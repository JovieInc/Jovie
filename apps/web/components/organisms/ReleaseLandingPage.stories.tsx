import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentProps } from 'react';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { DemoClientProviders } from '@/components/features/demo/DemoClientProviders';
import {
  DEMO_PROVIDER_CONFIG,
  DEMO_RELEASE_VIEW_MODELS,
} from '@/components/features/demo/mock-release-data';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

const RELEASE = DEMO_RELEASE_VIEW_MODELS[0];
const ARTIST = INTERNAL_DJ_DEMO_PERSONA.profile;

export const WEB196_RELEASE_ARGS = {
  release: {
    title: RELEASE.title,
    artworkUrl: RELEASE.artworkUrl ?? null,
    releaseDate: RELEASE.releaseDate ?? null,
    previewUrl: RELEASE.previewUrl ?? null,
  },
  artist: {
    name: ARTIST.displayName,
    handle: ARTIST.handle,
    avatarUrl: ARTIST.avatarSrc,
  },
  providers: RELEASE.providers.map(provider => ({
    key: provider.key,
    label: provider.label,
    accent: DEMO_PROVIDER_CONFIG[provider.key].accent,
    url: provider.url,
  })),
  tracking: {
    contentType: 'release',
    contentId: RELEASE.id,
    smartLinkSlug: RELEASE.slug,
  },
  utmParams: { utm_source: 'jovie' },
} satisfies ComponentProps<typeof ReleaseLandingPage>;

const meta = {
  title: 'Public/Routes/ReleaseSmartLink',
  component: ReleaseLandingPage,
  decorators: [
    Story => (
      <DemoClientProviders>
        <Story />
      </DemoClientProviders>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Deterministic source-backed presentation for the legacy web-196-r--[slug] fallback. The story mounts the exact ReleaseLandingPage body with the checked-in internal demo persona and release. Database lookup, canonical redirects, provider redirects, metadata, and deployed release data remain route-owned.',
      },
    },
    pen: {
      registryId: 'web-196-r--[slug]',
      route: '/r/[slug]',
      source: 'apps/web/app/r/[slug]/ReleaseLandingPage.tsx',
      sourceExport: 'ReleaseLandingPage',
      storyExport: 'Web196LegacyFallback',
      sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b',
      fixture: 'INTERNAL_DJ_DEMO_PERSONA + DEMO_RELEASE_VIEW_MODELS[0]',
      proofTier: 'source-backed',
    },
  },
  tags: ['autodocs'],
  args: WEB196_RELEASE_ARGS,
} satisfies Meta<typeof ReleaseLandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web196LegacyFallback: Story = {
  name: 'web-196 /r/[slug] — legacy fallback',
};
