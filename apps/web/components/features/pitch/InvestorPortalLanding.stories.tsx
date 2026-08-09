import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvestorBrief } from './InvestorBrief';

const meta = {
  title: 'Investor/Routes/InvestorPortalLanding',
  component: InvestorBrief,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact source-backed fallback body for web-188-investor-portal. The token-gated server route mounts InvestorBrief in embedded mode; this deterministic state keeps investorName null, matching the shipped no-cookie, missing-record, expired-record, and lookup-failure fallback without fabricating private investor data.',
      },
    },
    pen: {
      registryId: 'web-188-investor-portal',
      route: '/investor-portal',
      source: 'apps/web/components/features/pitch/InvestorBrief.tsx',
      sourceExport: 'InvestorBrief',
      storyExport: 'Web188AnonymousFallback',
      sourceSha: '02193d203a6dce76657f5e3988a173fc35ae07ff',
      fixture: 'shipped null investorName fallback',
      proofTier: 'source-backed',
    },
  },
  tags: ['autodocs'],
  args: {
    embedded: true,
    investorName: null,
  },
} satisfies Meta<typeof InvestorBrief>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web188AnonymousFallback: Story = {
  name: 'web-188 /investor-portal — anonymous fallback',
};
