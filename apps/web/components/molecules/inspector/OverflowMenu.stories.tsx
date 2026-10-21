import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { OverflowMenu } from './OverflowMenu';

const meta = {
  title: 'Molecules/Inspector/OverflowMenu',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: OverflowMenu,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['align', 'testId'] },
  },
  args: {
    label: 'Share link actions',
    disabled: false,
    items: [
      { id: 'open', label: 'Open', onSelect: fn() },
      {
        id: 'revoke',
        label: 'Revoke private link',
        variant: 'destructive',
        separatorBefore: true,
        onSelect: fn(),
      },
    ],
  },
} satisfies Meta<typeof OverflowMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShareLinkActions: Story = {};

export const ActionsOpen: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: args.label }));
    await expect(
      await body.findByRole('menuitem', { name: 'Revoke private link' })
    ).toBeVisible();
    await userEvent.click(body.getByRole('menuitem', { name: 'Open' }));
    await expect(args.items[0].onSelect).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: args.label }));
    await expect(await body.findByRole('menu')).toBeVisible();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button')).toBeDisabled();
  },
};

export const NoActions: Story = {
  args: { items: [] },
  play: Disabled.play,
};
