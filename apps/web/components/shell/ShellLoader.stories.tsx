import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShellLoader } from './ShellLoader';

const meta = {
  title: 'Shell/ShellLoader',
  component: ShellLoader,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ShellLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bloom: Story = {
  args: {
    phase: 'bloom',
  },
};

export const Reveal: Story = {
  args: {
    phase: 'reveal',
  },
};

export const Done: Story = {
  args: {
    phase: 'done',
  },
};
