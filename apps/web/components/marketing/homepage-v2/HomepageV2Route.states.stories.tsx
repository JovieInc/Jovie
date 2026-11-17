import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageV2Route } from './HomepageV2Route';

const meta = {
  title: 'Marketing/Homepage V2/HomepageV2Route States',
  component: HomepageV2Route,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomepageV2Route>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the full route in an Arabic document direction. */
export const RtlDocument: Story = {
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
