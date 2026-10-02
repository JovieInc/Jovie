import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  StableHeaderChipRail,
  StableHeaderTextSlot,
} from './StableHeaderSlots';

/**
 * Layout-stable header slots used by `EntityHeader` / `DrawerHero`. Both
 * reserve their box height even when empty so entity headers never jump
 * (zero layout shift) as data streams in.
 */
const meta = {
  title: 'Atoms/StableHeaderSlots',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextSlotWithContent: Story = {
  name: 'StableHeaderTextSlot / with content',
  render: () => (
    <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1}>
        Taylor Swift
      </StableHeaderTextSlot>
    </div>
  ),
};

export const TextSlotTwoLines: Story = {
  name: 'StableHeaderTextSlot / two lines',
  render: () => (
    <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='sm' lineCount={2}>
        A very long subtitle that wraps onto a second line before truncating
      </StableHeaderTextSlot>
    </div>
  ),
};

export const TextSlotReservedEmpty: Story = {
  name: 'StableHeaderTextSlot / reserved (empty)',
  render: () => (
    <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1} reserve />
    </div>
  ),
};

export const ChipRailWithContent: Story = {
  name: 'StableHeaderChipRail / with content',
  render: () => (
    <div className='w-72 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderChipRail>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Verified
        </span>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Pro
        </span>
      </StableHeaderChipRail>
    </div>
  ),
};

export const ChipRailReservedEmpty: Story = {
  name: 'StableHeaderChipRail / reserved (empty)',
  render: () => (
    <div className='w-72 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderChipRail reserve />
    </div>
  ),
};
