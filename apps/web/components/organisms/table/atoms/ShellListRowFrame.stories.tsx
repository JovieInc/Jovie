import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ShellListRowButton,
  ShellListRowDisclosureIcon,
  ShellListRowFrame,
} from './ShellListRowFrame';

const meta = {
  title: 'Organisms/Table/Atoms/ShellListRowFrame',
  component: ShellListRowFrame,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShellListRowFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShellChrome: Story = {
  args: {
    chrome: 'shell',
    density: 'standard',
    interactive: true,
    children: (
      <div className='flex min-w-0 flex-1 items-center justify-between gap-3 px-3'>
        <span className='truncate text-sm font-medium'>Command result</span>
        <span className='shrink-0 text-2xs text-tertiary-token'>Cmd+1</span>
      </div>
    ),
  },
};

export const Selected: Story = {
  args: {
    chrome: 'shell',
    density: 'standard',
    isSelected: true,
    interactive: true,
    children: (
      <div className='flex min-w-0 flex-1 items-center justify-between gap-3 px-3'>
        <span className='truncate text-sm font-medium'>Selected result</span>
        <span className='shrink-0 text-2xs text-tertiary-token'>Cmd+2</span>
      </div>
    ),
  },
};

export const DensityMatrix: Story = {
  render: () => (
    <div className='space-y-1'>
      <ShellListRowFrame chrome='shell' density='tight'>
        <div className='px-3 text-2xs'>Tight nested row</div>
      </ShellListRowFrame>
      <ShellListRowFrame chrome='shell' density='compact'>
        <div className='px-3 text-app'>Compact Linear row (40px)</div>
      </ShellListRowFrame>
      <ShellListRowFrame chrome='shell' density='dense'>
        <div className='px-3 text-xs'>Dense admin row (32px)</div>
      </ShellListRowFrame>
      <ShellListRowFrame chrome='shell' density='standard'>
        <div className='px-3 text-app'>Standard list row (44px)</div>
      </ShellListRowFrame>
      <ShellListRowFrame chrome='shell' density='spacious'>
        <div className='flex items-center justify-between px-3 text-sm'>
          <span>Disclosure row</span>
          <ShellListRowDisclosureIcon open />
        </div>
      </ShellListRowFrame>
    </div>
  ),
};

export const ButtonRow: Story = {
  render: () => (
    <ShellListRowButton
      chrome='shell'
      density='standard'
      isSelected
      className='w-full px-3 text-left text-sm font-medium'
    >
      Clickable row
    </ShellListRowButton>
  ),
};
