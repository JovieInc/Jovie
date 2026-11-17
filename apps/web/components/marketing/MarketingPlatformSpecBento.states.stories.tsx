import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from './MarketingPageShell';
import { MarketingPlatformSpecBento } from './MarketingPlatformSpecBento';

/** Rendered states of the spec bento; the default lives in MarketingPlatformSpecBento.stories.tsx. */
const meta: Meta<typeof MarketingPlatformSpecBento> = {
  title: 'Marketing/Primitives/MarketingPlatformSpecBento States',
  component: MarketingPlatformSpecBento,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the fixed bento in a right-to-left document direction. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <MarketingPageShell className='system-b-marketing'>
          <Story />
        </MarketingPageShell>
      </div>
    ),
  ],
};
