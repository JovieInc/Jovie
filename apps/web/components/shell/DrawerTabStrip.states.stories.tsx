import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { DrawerTabStrip } from './DrawerTabStrip';

type Tab = 'overview' | 'distribution' | 'activity';

/** Rendered states of the drawer tab strip beyond the default stories. */
const meta = {
  title: 'Shell/DrawerTabStrip/States',
  component: DrawerTabStrip<Tab>,
  parameters: { layout: 'centered' },
  decorators: [
    function withDrawerWidth(StoryFn) {
      return <div className='w-72 bg-base'>{StoryFn()}</div>;
    },
  ],
  args: {
    tabs: [
      { value: 'overview', label: 'Overview' },
      { value: 'distribution', label: 'Distribution' },
    ],
    active: 'overview',
    onChange: fn(),
  },
} satisfies Meta<typeof DrawerTabStrip<Tab>>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: a drawer with no sections renders an empty tablist. */
export const EmptyNoTabs: Story = { args: { tabs: [] } };

/** Partial: a single section stretches across the strip. */
export const PartialSingleTab: Story = {
  args: { tabs: [{ value: 'overview', label: 'Overview' }] },
};

/** Long content: long labels share the strip equally. */
export const LongContentLabels: Story = {
  args: {
    tabs: [
      { value: 'overview', label: 'Release overview and credits' },
      { value: 'distribution', label: 'Distribution and store status' },
      { value: 'activity', label: 'Activity' },
    ],
    active: 'distribution',
  },
};

/** Permission denied: a section the viewer cannot open is simply left out. */
export const PermissionDeniedHiddenTab: Story = {
  args: {
    tabs: [
      { value: 'overview', label: 'Overview' },
      { value: 'activity', label: 'Activity' },
    ],
    active: 'activity',
  },
};

/** Rtl: the strip in a right-to-left drawer. */
export const RtlTabs: Story = {
  args: {
    tabs: [
      { value: 'overview', label: 'نظرة عامة' },
      { value: 'distribution', label: 'التوزيع' },
    ],
  },
  decorators: [withRtlFrame],
};
