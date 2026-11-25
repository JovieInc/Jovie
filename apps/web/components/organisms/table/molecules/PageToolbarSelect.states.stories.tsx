import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { PageToolbarSelect } from './PageToolbarSelect';

type Identity = 'all' | 'identified' | 'anonymous';

/** Rendered states of the toolbar select beyond the default stories. */
const meta = {
  title: 'Organisms/Table/Molecules/PageToolbarSelect/States',
  component: PageToolbarSelect<Identity>,
  parameters: { layout: 'centered' },
  args: {
    label: 'Identity',
    value: 'all',
    options: [
      { value: 'all', label: 'All People' },
      { value: 'identified', label: 'Identified' },
    ],
    onValueChange: fn(),
  },
} satisfies Meta<typeof PageToolbarSelect<Identity>>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: no options, so the trigger falls back to the raw value. */
export const EmptyNoOptions: Story = { args: { options: [] } };

/** Partial: no default value, so the trigger never reads as filtered. */
export const PartialNoDefault: Story = { args: { value: 'identified' } };

/** Long content: a long option label truncates inside the trigger. */
export const LongContentLabel: Story = {
  args: {
    value: 'identified',
    options: [
      { value: 'all', label: 'All People' },
      {
        value: 'identified',
        label: 'Identified people with a verified email and phone',
      },
    ],
  },
};

/** Rtl: the trigger and its chevron in a right-to-left toolbar. */
export const RtlTrigger: Story = {
  args: { label: 'الهوية', options: [{ value: 'all', label: 'كل الأشخاص' }] },
  decorators: [withRtlFrame],
};
