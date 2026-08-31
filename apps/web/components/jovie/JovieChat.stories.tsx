import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieChat } from './JovieChat';

const meta = {
  title: 'Jovie/JovieChat',
  component: JovieChat,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof JovieChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
