import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StandaloneProductPage } from './StandaloneProductPage';

const meta = {
  title: 'Organisms/StandaloneProductPage',
  component: StandaloneProductPage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <div className='rounded-lg border border-subtle bg-surface-0 p-6 text-center text-sm text-secondary-token'>
        Page content
      </div>
    ),
  },
} satisfies Meta<typeof StandaloneProductPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Centered: Story = {
  args: {
    centered: true,
  },
};

export const NarrowWidth: Story = {
  args: {
    width: 'sm',
  },
};
