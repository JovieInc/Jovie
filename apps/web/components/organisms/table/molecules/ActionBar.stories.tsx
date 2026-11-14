import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Download, Filter, Settings2 } from 'lucide-react';
import { ActionBar, ActionBarButton, ActionBarItem } from './ActionBar';

const ICON_CLASS = 'h-3.5 w-3.5';

const meta = {
  title: 'Organisms/Table/Molecules/ActionBar',
  component: ActionBar,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['tooltipLabel', 'label', 'icon'],
    },
  },
} satisfies Meta<typeof ActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Actions',
  },
};

export const WithButtons: Story = {
  args: {
    children: (
      <>
        <ActionBarItem tooltipLabel='Filter rows' shortcut='F'>
          <ActionBarButton
            label='Filter'
            icon={<Filter className={ICON_CLASS} />}
          />
        </ActionBarItem>
        <ActionBarItem tooltipLabel='Display options' shortcut='V'>
          <ActionBarButton
            label='Display'
            icon={<Settings2 className={ICON_CLASS} />}
          />
        </ActionBarItem>
      </>
    ),
  },
};

export const PartialWithoutShortcuts: Story = {
  args: {
    children: (
      <>
        <ActionBarItem tooltipLabel='Export as CSV'>
          <ActionBarButton
            label='Export'
            icon={<Download className={ICON_CLASS} />}
            mobileIconOnly
          />
        </ActionBarItem>
        <ActionBarButton
          label='Display'
          icon={<Settings2 className={ICON_CLASS} />}
        />
      </>
    ),
  },
};

export const LongLabels: Story = {
  args: {
    className: 'max-w-md',
    children: (
      <>
        <ActionBarItem
          tooltipLabel='Filter rows by every saved audience segment'
          shortcut='⌘⇧F'
        >
          <ActionBarButton
            label='Filter By Saved Audience Segment'
            icon={<Filter className={ICON_CLASS} />}
          />
        </ActionBarItem>
        <ActionBarItem tooltipLabel='Export every visible column as a CSV file'>
          <ActionBarButton
            label='Export Every Visible Column'
            icon={<Download className={ICON_CLASS} />}
          />
        </ActionBarItem>
      </>
    ),
  },
};

export const RtlButtons: Story = {
  args: {
    children: (
      <>
        <ActionBarItem tooltipLabel='تصفية الصفوف' shortcut='F'>
          <ActionBarButton
            label='تصفية'
            icon={<Filter className={ICON_CLASS} />}
          />
        </ActionBarItem>
        <ActionBarItem tooltipLabel='خيارات العرض'>
          <ActionBarButton
            label='العرض'
            icon={<Settings2 className={ICON_CLASS} />}
          />
        </ActionBarItem>
      </>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
