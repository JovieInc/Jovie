import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon } from './Icon';

const meta = {
  title: 'Atoms/Icon',
  component: Icon,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Activity',
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sized: Story = {
  args: {
    name: 'Bell',
    size: 32,
  },
};
