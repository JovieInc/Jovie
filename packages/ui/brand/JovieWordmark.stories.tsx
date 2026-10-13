import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieWordmark } from './JovieWordmark';

const meta: Meta<typeof JovieWordmark> = {
  title: 'UI/Brand/JovieWordmark',
  component: JovieWordmark,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { height: 32, collapsed: false, state: 'idle' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Collapsed: Story = {
  args: { collapsed: true },
};

export const CollapsedLoading: Story = {
  args: { collapsed: true, state: 'loading' },
};

export const TextMaster: Story = {
  args: { height: 16 },
};
