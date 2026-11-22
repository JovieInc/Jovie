import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SaveViewButton } from './SaveViewButton';

const meta = {
  title: 'Features/Views/SaveViewButton',
  component: SaveViewButton,
  tags: ['autodocs'],
  args: { token: 'a'.repeat(32), viewerOwnsView: false },
} satisfies Meta<typeof SaveViewButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Owned: Story = { args: { viewerOwnsView: true } };
