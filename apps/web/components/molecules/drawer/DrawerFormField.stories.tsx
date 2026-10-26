import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DrawerFormField } from './DrawerFormField';

const meta = {
  title: 'Molecules/Drawer/DrawerFormField',
  component: DrawerFormField,
  parameters: {
    layout: 'centered',
  },
  decorators: [Story => <div className='w-full max-w-sm'>{Story()}</div>],
  args: {
    label: 'Profile URL',
    htmlFor: 'profile-url',
    helperText: 'Use the public URL customers already know.',
    children: (
      <input
        id='profile-url'
        className='h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token'
        defaultValue='jovie.com/tim'
      />
    ),
  },
} satisfies Meta<typeof DrawerFormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHelperText: Story = {
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByLabelText('Profile URL');
    await expect(field).toHaveAttribute('id', 'profile-url');
    await userEvent.click(field);
    await expect(field).toHaveFocus();
  },
};

export const WithoutHelperText: Story = {
  args: {
    label: 'Display name',
    htmlFor: 'display-name',
    helperText: undefined,
    children: (
      <input
        id='display-name'
        className='h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token'
        defaultValue='Tim White'
      />
    ),
  },
};
