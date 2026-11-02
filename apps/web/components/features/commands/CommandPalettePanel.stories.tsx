import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CommandPalettePanel } from './CommandPalettePanel';

const meta = {
  title: 'Features/Commands/CommandPalettePanel',
  component: CommandPalettePanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-xl rounded-3xl border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CommandPalettePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Registry: Story = {};
