import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  DrawerInlineIconButton,
  type DrawerInlineIconButtonProps,
} from './DrawerInlineIconButton';

/** The button branch, named by `aria-label`, which every story here uses. */
type LabelledButtonProps = Extract<
  DrawerInlineIconButtonProps,
  { readonly href?: never; readonly 'aria-label': string }
>;

const meta = {
  title: 'Molecules/Drawer/DrawerInlineIconButton',
  component: DrawerInlineIconButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    'aria-label': 'Copy link',
    onClick: fn(),
    children: <Copy className='h-3.5 w-3.5' />,
  },
} satisfies Meta<LabelledButtonProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Copy link',
    });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const FadeOnParentHover: Story = {
  args: {
    fadeOnParentHover: true,
  },
};

export const AsLink: Story = {
  args: {
    'aria-label': 'Open profile',
  },
  render: () => (
    <DrawerInlineIconButton href='https://jov.ie/tim' aria-label='Open profile'>
      <Copy className='h-3.5 w-3.5' />
    </DrawerInlineIconButton>
  ),
};
