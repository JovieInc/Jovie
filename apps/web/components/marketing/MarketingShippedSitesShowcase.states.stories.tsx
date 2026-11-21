import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from './MarketingPageShell';
import { MarketingShippedSitesShowcase } from './MarketingShippedSitesShowcase';

/** Rendered states of the product gallery; the default lives in MarketingShippedSitesShowcase.stories.tsx. */
const meta: Meta<typeof MarketingShippedSitesShowcase> = {
  title: 'Marketing/Sections/product-gallery States',
  component: MarketingShippedSitesShowcase,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the fixed gallery in a right-to-left document direction. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <MarketingPageShell>
          <Story />
        </MarketingPageShell>
      </div>
    ),
  ],
};
