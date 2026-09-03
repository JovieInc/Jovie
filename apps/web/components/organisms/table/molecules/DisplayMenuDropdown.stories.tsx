import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DisplayMenuDropdown } from './DisplayMenuDropdown';

const meta = {
  title: 'Organisms/Table/DisplayMenuDropdown',
  component: DisplayMenuDropdown,
  parameters: {
    layout: 'padded',
    jovie: {
      uncoveredProps: ['columnId', 'isVisible', 'onToggle', 'visible'],
    },
  },
} satisfies Meta<typeof DisplayMenuDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const columns = [
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
  { id: 'releaseDate', label: 'Release date' },
];

export const GroupingToggle: Story = {
  args: {
    viewMode: 'list',
    availableViewModes: ['list', 'board'],
    onViewModeChange: fn(),
    density: 'normal',
    onDensityChange: fn(),
    availableColumns: columns,
    columnVisibility: {
      title: true,
      artist: true,
      releaseDate: false,
    },
    onColumnVisibilityChange: fn(),
    groupingEnabled: true,
    onGroupingToggle: fn(),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Display' })
    );

    await expect(
      await within(canvasElement.ownerDocument.body).findByRole('switch', {
        name: 'Group rows',
      })
    ).toBeChecked();
  },
};
