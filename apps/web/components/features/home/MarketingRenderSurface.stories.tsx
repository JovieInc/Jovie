import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingRenderSurface } from './MarketingRenderSurface';

const meta = {
  title: 'Features/Home/MarketingRenderSurface',
  component: MarketingRenderSurface,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['hideChrome'],
    },
  },
  decorators: [
    Story => (
      <div className='w-[26rem] max-w-full bg-page p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingRenderSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Profile: Story = { args: { surfaceId: 'profile' } };
export const Notification: Story = { args: { surfaceId: 'notification' } };
export const Tips: Story = { args: { surfaceId: 'tips' } };
export const Countdown: Story = { args: { surfaceId: 'countdown' } };
export const Fans: Story = { args: { surfaceId: 'fans' } };
export const CompactGlass: Story = { args: { surfaceId: 'compact-glass' } };
export const Tour: Story = { args: { surfaceId: 'tour' } };
