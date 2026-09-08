import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShellListRowFrame } from './ShellListRowFrame';

const meta = {
  title: 'Organisms/Table/Atoms/ShellListRowFrame',
  component: ShellListRowFrame,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 rounded-lg border border-subtle bg-surface-1 p-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: 'Release checklist row',
    className: 'flex items-center px-3',
  },
} satisfies Meta<typeof ShellListRowFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CompactInteractive: Story = {
  args: {
    density: 'compact',
    interactive: true,
  },
};

export const Selected: Story = {
  args: {
    interactive: true,
    isSelected: true,
  },
};
