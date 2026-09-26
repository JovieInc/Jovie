import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MARKETING_RENDER_ROUTE_SURFACES,
  MarketingRenderSurface,
} from './MarketingRenderSurface';

const meta = {
  title: 'Home/MarketingRenderSurface',
  component: MarketingRenderSurface,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['hideChrome'],
    },
  },
  decorators: [
    Story => (
      <div className='min-h-screen bg-page px-6 py-16'>
        <div className='mx-auto w-full max-w-md'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingRenderSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  args: { surfaceId: 'profile' },
};

export const Notification: Story = {
  args: { surfaceId: 'notification' },
};

export const Tips: Story = {
  args: { surfaceId: 'tips' },
};

export const Countdown: Story = {
  args: { surfaceId: 'countdown' },
};

export const Fans: Story = {
  args: { surfaceId: 'fans' },
};

/** Compact-glass surface registered by JOV-6248. */
export const CompactGlass: Story = {
  args: { surfaceId: 'compact-glass' },
};

export const Tour: Story = {
  args: { surfaceId: 'tour' },
};

/** All route surfaces in one matrix for visual review. */
export const AllSurfaces: Story = {
  render: () => (
    <div className='grid gap-6'>
      {MARKETING_RENDER_ROUTE_SURFACES.map(surface => (
        <div key={surface.id}>
          <p className='mb-2 text-xs uppercase tracking-widest text-white/50'>
            {surface.label}
          </p>
          <MarketingRenderSurface surfaceId={surface.id} />
        </div>
      ))}
      <div>
        <p className='mb-2 text-xs uppercase tracking-widest text-white/50'>
          Tour
        </p>
        <MarketingRenderSurface surfaceId='tour' />
      </div>
    </div>
  ),
};
