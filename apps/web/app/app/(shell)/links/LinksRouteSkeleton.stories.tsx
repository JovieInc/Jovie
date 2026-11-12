import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LinksRouteSkeleton } from './LinksRouteSkeleton';

const meta = {
  title: 'App/Links/Route Skeleton',
  component: LinksRouteSkeleton,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <LinksRouteSkeleton />
    </div>
  ),
} satisfies Meta<typeof LinksRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First-boot fallback for /app/links: the real header row over held rows. */
export const LoadingLinks: Story = {};

/** On a phone the header row keeps one line and the table clips at the edge. */
export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** In a right-to-left document the header row and the bars mirror. */
export const RtlMirrored: Story = {
  render: () => (
    <div
      dir='rtl'
      lang='ar'
      className='relative flex h-160 w-full overflow-hidden bg-base'
    >
      <LinksRouteSkeleton />
    </div>
  ),
};
