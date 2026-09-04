import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DrawerFormGridRow } from './DrawerFormGridRow';

const meta = {
  title: 'Molecules/Drawer/DrawerFormGridRow',
  component: DrawerFormGridRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [Story => <div className='w-full max-w-md'>{Story()}</div>],
  args: {
    label: 'Release date',
    htmlFor: 'release-date',
    children: (
      <input
        id='release-date'
        className='h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token'
        defaultValue='2026-09-12'
      />
    ),
  },
} satisfies Meta<typeof DrawerFormGridRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByLabelText('Release date');
    await expect(field).toHaveAttribute('id', 'release-date');
    await userEvent.click(field);
    await expect(field).toHaveFocus();
  },
};

export const CustomLabelStyle: Story = {
  args: {
    label: 'Distribution',
    htmlFor: 'distribution',
    labelClassName: 'text-secondary-token',
    children: (
      <input
        id='distribution'
        className='h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token'
        defaultValue='Worldwide'
      />
    ),
  },
};
