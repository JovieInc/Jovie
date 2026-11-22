import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn, userEvent, within } from 'storybook/test';
import { DisplayMenuDropdown } from './DisplayMenuDropdown';

function Frame(Story: () => ReactNode) {
  return (
    <div className='flex min-h-96 w-full max-w-2xl justify-end'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='flex min-h-96 w-full max-w-2xl justify-start'>
      <Story />
    </div>
  );
}

async function openMenu({ canvasElement }: { canvasElement: HTMLElement }) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Display' })
  );
}

/**
 * State coverage for the display menu. The canonical story stays in
 * DisplayMenuDropdown.stories.tsx; these open the menu with no options, a
 * single section, very long column labels and the document direction.
 */
const meta = {
  title: 'Organisms/Table/DisplayMenuDropdown States',
  component: DisplayMenuDropdown,
  parameters: { layout: 'padded' },
  decorators: [Frame],
  play: openMenu,
} satisfies Meta<typeof DisplayMenuDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no view, density or column options, so only the header shows. */
export const EmptyNoOptions: Story = {};

/** Partial: density is the only option offered. */
export const PartialDensityOnly: Story = {
  args: { density: 'normal', onDensityChange: fn() },
};

const longColumns = [
  { id: 'a', label: 'Release date of the original studio recording' },
  { id: 'b', label: 'Primary artist and featured guest performers' },
  { id: 'c', label: 'Distribution territory restrictions' },
];

/** Long content: long column labels wrap inside the popover. */
export const LongContentColumns: Story = {
  args: {
    availableColumns: longColumns,
    columnVisibility: { a: true, b: false, c: true },
    onColumnVisibilityChange: fn(),
  },
};

/** Rtl: the menu follows the document direction. */
export const RtlDirection: Story = {
  decorators: [RtlFrame],
  args: {
    viewMode: 'list',
    availableViewModes: ['list', 'board'],
    onViewModeChange: fn(),
    density: 'compact',
    onDensityChange: fn(),
  },
};
