import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MarketingPlatformSpecBento,
  MarketingShippedSitesShowcase,
} from './MarketingFramerKit';

const meta = {
  title: 'Marketing/FramerKit',
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShippedSitesShowcase: Story = {
  name: 'ShippedSitesShowcase',
  render: () => <MarketingShippedSitesShowcase />,
};

export const PlatformSpecBento: Story = {
  name: 'PlatformSpecBento',
  render: () => <MarketingPlatformSpecBento />,
};
