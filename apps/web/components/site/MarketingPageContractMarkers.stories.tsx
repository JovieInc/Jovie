import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MarketingPageContractMarkers } from './MarketingPageContractMarkers';

const meta = {
  title: 'Site/MarketingPageContractMarkers',
  component: MarketingPageContractMarkers,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Hidden route-contract metadata for public marketing pages. The shared shell mounts this marker so tests can enforce page job, proof, success event, and primary CTA coverage.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingPageContractMarkers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenHomepageContract: Story = {
  render: () => <MarketingPageContractMarkers />,
};

export const RecordContract: Story = {
  render: () => (
    <MarketingPageContractMarkers
      contract={{
        routeGlob: '(marketing)/solutions/[audience]/page.tsx',
        url: '/solutions/artists',
        copyScope: 'music',
        job: 'show artists how profiles connect music, links, and permissioned fan updates',
        proof: 'profile gallery, capture flow, and conversion sections',
        successEvent: 'artist claims a profile',
        primaryCta: { href: '/signup', label: 'Claim your profile' },
        recordFamily: 'solutions',
      }}
    />
  ),
};
