import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DrawerEditableTextField } from './DrawerEditableTextField';

const meta = {
  title: 'Molecules/Drawer/DrawerEditableTextField',
  component: DrawerEditableTextField,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Display name',
    value: 'Tim White',
    editable: true,
    onSave: fn(() => Promise.resolve()),
  },
} satisfies Meta<typeof DrawerEditableTextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ReadOnly: Story = {
  args: {
    editable: false,
  },
};

export const Empty: Story = {
  args: {
    value: null,
    emptyLabel: 'Add a display name',
  },
};

export const WithCopyAction: Story = {
  args: {
    label: 'Profile URL',
    value: 'jov.ie/tim',
    copyValue: 'https://jov.ie/tim',
  },
};

export const EditingCommitsOnEnter: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Edit Display name' });
    await userEvent.click(trigger);
    const input = canvas.getByRole('textbox', { name: 'Edit Display name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tim W.{Enter}');
    await expect(args.onSave).toHaveBeenCalledWith('Tim W.');
  },
};
