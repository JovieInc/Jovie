import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { ActionsCell } from './ActionsCell';

/**
 * State coverage for the row actions slot. A row with no actions and no menu
 * renders an empty, right-aligned slot so the column keeps its width.
 */
const meta = {
  title: 'Organisms/Table/ActionsCell States',
  component: ActionsCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ActionsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: neither actions nor a menu, so no contextual slot is mounted. */
export const EmptyNoActions: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.system-b-table-contextual-action')
    ).toBeNull();
  },
};
