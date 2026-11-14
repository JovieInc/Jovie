import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { RootNotFoundHeader } from './RootNotFoundHeader';

const meta = {
  title: 'Organisms/RootNotFoundHeader',
  component: RootNotFoundHeader,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Server-rendered header of the root 404: the wordmark and a Sign in link, matching the minimal marketing header.',
      },
    },
  },
} satisfies Meta<typeof RootNotFoundHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The header is fixed to the top; the frame gives it a page to sit on. */
export const Default: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <RootNotFoundHeader />
    </div>
  ),
};
