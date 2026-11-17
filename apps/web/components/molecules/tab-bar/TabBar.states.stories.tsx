import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { TabBar } from './TabBar';

function RailDecorator(Story: () => ReactNode) {
  return (
    <div className='w-72'>
      <Story />
    </div>
  );
}

function RtlRailDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='w-72'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Molecules/Tab Bar/TabBar/States',
  component: TabBar,
  parameters: { layout: 'centered' },
  decorators: [RailDecorator],
  args: {
    value: 'details',
    onValueChange: fn(),
    options: [
      { value: 'details', label: 'Details' },
      { value: 'activity', label: 'Activity' },
    ],
    ariaLabel: 'Entity tabs',
  },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no tabs to show. */
export const EmptyNoTabs: Story = {
  args: { options: [] },
};

/** Partial: one tab disabled. */
export const PartialDisabledTab: Story = {
  args: {
    options: [
      { value: 'details', label: 'Details' },
      { value: 'activity', label: 'Activity', disabled: true },
    ],
  },
};

/** Long content: more and longer tabs than the rail fits, wrapping. */
export const LongContentWrapping: Story = {
  args: {
    overflowMode: 'wrap',
    variant: 'segment',
    options: [
      { value: 'details', label: 'Release details' },
      { value: 'activity', label: 'Activity and history' },
      { value: 'sources', label: 'Sources and credits' },
      { value: 'files', label: 'Files and artwork' },
    ],
  },
};

/** RTL: Arabic tabs in a right-to-left rail. */
export const RtlTabs: Story = {
  args: {
    distribution: 'fill',
    options: [
      { value: 'details', label: 'التفاصيل' },
      { value: 'activity', label: 'النشاط' },
    ],
    ariaLabel: 'علامات التبويب',
  },
  decorators: [RtlRailDecorator],
};
