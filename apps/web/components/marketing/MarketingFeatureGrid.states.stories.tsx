import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingFeatureGrid } from './MarketingFeatureGrid';

const meta = {
  title: 'Marketing/MarketingFeatureGrid States',
  component: MarketingFeatureGrid,
  args: { items: [] },
} satisfies Meta<typeof MarketingFeatureGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a grid with no items renders an empty container. */
export const EmptyNoItems: Story = {};

/** Long content: wrapping titles and long descriptions. */
export const LongContentItems: Story = {
  args: {
    items: [
      {
        title: 'Nothing is published until you approve the final thumbnail',
        description:
          'Every generated option stays a draft in your workspace. You choose one, adjust it, and only then does it go anywhere near your channel, your release page or your fans.',
      },
      {
        title: 'Your artwork stays yours',
        description:
          'Uploads are used only to make your thumbnails and are never shared with other artists or used to train anything.',
      },
      {
        title: 'Clear labels',
        description: 'Generated images are labelled as generated.',
      },
    ],
  },
};

/** Right-to-left: Arabic items in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    items: [
      { title: 'لا شيء يُنشر دون موافقتك', description: 'كل خيار يبقى مسودة.' },
      { title: 'أعمالك الفنية ملكك', description: 'لا تُشارك مع أحد.' },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
