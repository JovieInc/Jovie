import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicPageErrorFallback } from './PublicPageErrorFallback';

const meta: Meta<typeof PublicPageErrorFallback> = {
  title: 'Providers/PublicPageErrorFallback',
  component: PublicPageErrorFallback,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    error: Object.assign(new Error('The landing page failed to render.'), {
      digest: 'public-page-timeout',
    }),
    context: 'LandingPage',
    onRefresh: () => undefined,
  },
};
