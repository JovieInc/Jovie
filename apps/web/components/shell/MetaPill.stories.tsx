import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MetaPill } from './MetaPill';

const meta = {
  title: 'Shell/MetaPill',
  component: MetaPill,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof MetaPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
