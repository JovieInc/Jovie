import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

const meta: Meta<typeof HeaderSearchSurfaceFromContext> = {
  title: 'Shell/HeaderSearchSurfaceFromContext',
  component: HeaderSearchSurfaceFromContext,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <div className='w-64 bg-sidebar p-3'>
          <Story />
        </div>
      </HeaderActionsProvider>
    ),
  ],
  args: {
    calm: true,
  },
};

export default meta;
type Story = StoryObj<typeof HeaderSearchSurfaceFromContext>;

export const Calm: Story = {};

export const Default: Story = {
  args: {
    calm: false,
  },
};
