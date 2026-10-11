import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicSurfaceFooter } from './PublicSurfaceFooter';

const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceFooter',
  component: PublicSurfaceFooter,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <p className='text-center text-sm text-secondary-token'>Footer content</p>
    ),
  },
} satisfies Meta<typeof PublicSurfaceFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
