import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieIcon } from './JovieIcon';

const meta = {
  title: 'Atoms/JovieIcon',
  component: JovieIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    size: 24,
  },
} satisfies Meta<typeof JovieIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    size: 20,
    className: 'text-accent',
  },
};

export const Sized: Story = {
  args: {
    size: 40,
  },
};

export const ExplicitThemeContrast: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <div className='rounded-lg bg-surface-1 p-6'>
        <JovieIcon size={32} />
      </div>
      <div className='dark rounded-lg bg-surface-0 p-6'>
        <JovieIcon size={32} />
      </div>
    </div>
  ),
};
