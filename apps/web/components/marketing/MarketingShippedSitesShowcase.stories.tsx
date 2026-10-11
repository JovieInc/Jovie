import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from './MarketingPageShell';
import { MarketingShippedSitesShowcase } from './MarketingShippedSitesShowcase';

const meta: Meta<typeof MarketingShippedSitesShowcase> = {
  title: 'Marketing/Sections/product-gallery',
  component: MarketingShippedSitesShowcase,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <MarketingPageShell>
        <Story />
      </MarketingPageShell>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
