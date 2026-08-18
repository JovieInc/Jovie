import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Kbd } from './kbd';

const meta: Meta<typeof Kbd> = {
  title: 'UI/Atoms/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: '⌘K' } };
export const TooltipVariant: Story = {
  args: { children: 'Esc', variant: 'tooltip' },
  parameters: { backgrounds: { default: 'dark' } },
};

export const ShortcutSequence: Story = {
  render: () => (
    <div className='flex items-center gap-1.5 text-sm text-secondary-token'>
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
      <span className='ml-2'>Open command palette</span>
    </div>
  ),
};
