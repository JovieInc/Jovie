import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import SmartLinkNotFound from '@/app/[username]/[slug]/not-found';

const SOURCE_SHA = '12224180f432e72653646f5588a5e320a92b493e';
const SOURCE_PATH = 'apps/web/app/[username]/[slug]/not-found.tsx';

const meta = {
  title: 'Public/Routes/SmartLinkNotFound',
  component: SmartLinkNotFound,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The exact shared missing-entity body inherited by public release, track, promo-download, and sound routes. These stories prove only the shipped missing state; successful server-backed states remain route-owned and require real data.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SmartLinkNotFound>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web045MissingTrack: Story = {
  name: 'web-045 /[username]/[slug]/[trackSlug] missing',
  parameters: {
    pen: {
      registryId: 'web-045-[username]--[slug]--[trackSlug]',
      route: '/[username]/[slug]/[trackSlug]',
      source: SOURCE_PATH,
      sourceExport: 'default',
      storyExport: 'Web045MissingTrack',
      sourceSha: SOURCE_SHA,
      fixtureState: 'missing',
      proofTier: 'source-backed-missing-state',
    },
  },
};

export const Web046MissingPromoDownload: Story = {
  name: 'web-046 /[username]/[slug]/download missing',
  parameters: {
    pen: {
      registryId: 'web-046-[username]--[slug]--download',
      route: '/[username]/[slug]/download',
      source: SOURCE_PATH,
      sourceExport: 'default',
      storyExport: 'Web046MissingPromoDownload',
      sourceSha: SOURCE_SHA,
      fixtureState: 'missing',
      proofTier: 'source-backed-missing-state',
    },
  },
};

export const Web047MissingRelease: Story = {
  name: 'web-047 /[username]/[slug] missing',
  parameters: {
    pen: {
      registryId: 'web-047-[username]--[slug]',
      route: '/[username]/[slug]',
      source: SOURCE_PATH,
      sourceExport: 'default',
      storyExport: 'Web047MissingRelease',
      sourceSha: SOURCE_SHA,
      fixtureState: 'missing',
      proofTier: 'source-backed-missing-state',
    },
  },
};

export const Web048MissingSoundsRelease: Story = {
  name: 'web-048 /[username]/[slug]/sounds missing',
  parameters: {
    pen: {
      registryId: 'web-048-[username]--[slug]--sounds',
      route: '/[username]/[slug]/sounds',
      source: SOURCE_PATH,
      sourceExport: 'default',
      storyExport: 'Web048MissingSoundsRelease',
      sourceSha: SOURCE_SHA,
      fixtureState: 'missing',
      proofTier: 'source-backed-missing-state',
    },
  },
};
