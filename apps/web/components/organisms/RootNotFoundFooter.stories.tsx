import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { RootNotFoundFooter } from './RootNotFoundFooter';

const meta = {
  title: 'Organisms/RootNotFoundFooter',
  component: RootNotFoundFooter,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Server-rendered footer of the root 404: the claim CTA, the code-default link columns and the legal row, matching the expanded marketing footer.',
      },
    },
  },
} satisfies Meta<typeof RootNotFoundFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='bg-base'>
      <RootNotFoundFooter />
    </div>
  ),
};
