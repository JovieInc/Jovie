import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { DrawerEditableTextField } from './DrawerEditableTextField';

function DrawerDecorator(Story: () => ReactNode) {
  return (
    <div className='w-60 bg-surface-0 p-3'>
      <Story />
    </div>
  );
}

function RtlDrawerDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='w-60 bg-surface-0 p-3'>
      <Story />
    </div>
  );
}

function rejectSave(): Promise<void> {
  return Promise.reject(new Error('Display name could not be saved'));
}

const meta = {
  title: 'Molecules/Drawer/DrawerEditableTextField/States',
  component: DrawerEditableTextField,
  parameters: { layout: 'centered' },
  decorators: [DrawerDecorator],
  args: {
    label: 'Display name',
    value: 'Nova',
    editable: true,
    onSave: fn(() => Promise.resolve()),
  },
} satisfies Meta<typeof DrawerEditableTextField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: saving rejects, so the field reports the failure with a toast. */
export const ErrorSaveRejected: Story = {
  args: { onSave: fn(rejectSave) },
};

/** Partial: a read-only value with a copy action and no edit handler. */
export const PartialReadOnlyCopy: Story = {
  args: {
    editable: false,
    onSave: undefined,
    copyValue: 'Nova',
    copyLabel: 'display name',
  },
};

/** Long content: a long URL value in a narrow drawer. */
export const LongContentUrl: Story = {
  args: {
    label: 'Website',
    value:
      'https://example.com/releases/the-midnight-orchestra/deluxe-edition-2030',
    monospace: true,
  },
};

/** RTL: an Arabic value in a right-to-left drawer. */
export const RtlValue: Story = {
  args: { label: 'الاسم المعروض', value: 'نوفا' },
  decorators: [RtlDrawerDecorator],
};
