import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverflowMenuTrigger } from './overflow-menu-trigger';

const meta: Meta<typeof OverflowMenuTrigger> = {
  title: 'UI/Atoms/OverflowMenuTrigger',
  component: OverflowMenuTrigger,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { 'aria-label': 'More actions' },
};

export const ActiveOverflow: Story = {
  args: { 'aria-label': 'More actions', hasActiveOverflow: true },
};

export const Disabled: Story = {
  args: { 'aria-label': 'More actions', disabled: true },
};
