import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvestorBrief } from './InvestorBrief';

const meta = {
  title: 'Investor/Routes/Pitch',
  component: InvestorBrief,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Source-backed presentation for web-195-pitch. The story mounts the same InvestorBrief body as /pitch; metadata and noindex policy remain route-owned, while evidence labels and investor copy remain owned by the checked-in fundraising registry.',
      },
    },
    pen: {
      registryId: 'web-195-pitch',
      route: '/pitch',
      source: 'apps/web/components/features/pitch/InvestorBrief.tsx',
      sourceExport: 'InvestorBrief',
      storyExport: 'Web195Pitch',
      sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b',
      proofTier: 'source-backed',
    },
  },
  tags: ['autodocs'],
  args: {
    embedded: false,
    investorName: null,
  },
} satisfies Meta<typeof InvestorBrief>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web195Pitch: Story = {
  name: 'web-195 /pitch',
};
