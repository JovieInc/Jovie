import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceQuickActionsCell',
  component: AudienceQuickActionsCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='group w-32 bg-surface-0 p-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    onExport: fn(),
    onBlock: fn(),
  },
} satisfies Meta<typeof AudienceQuickActionsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Export contact' })
    );
    await expect(args.onExport).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Block member' }));
    await expect(args.onBlock).toHaveBeenCalled();
  },
};
