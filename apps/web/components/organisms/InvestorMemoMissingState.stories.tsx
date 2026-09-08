import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import RootNotFound from '@/app/not-found';

const meta = {
  title: 'Public/Routes/InvestorMemoMissingState',
  component: RootNotFound,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The exact root not-found body reached by web-187 when investor access is absent or the requested memo is not present in the checked-in manifest. This story proves only that shipped missing state; it does not load or reproduce investor memo content.',
      },
    },
    pen: {
      registryId: 'web-187-investor-portal--[slug]',
      route: '/investor-portal/[slug]',
      source: 'apps/web/app/not-found.tsx',
      sourceExport: 'default',
      storyExport: 'Web187MissingInvestorMemo',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      fixtureState: 'missing-access-or-memo',
      proofTier: 'source-backed-missing-state',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RootNotFound>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web187MissingInvestorMemo: Story = {
  name: 'web-187 /investor-portal/[slug] missing',
};
