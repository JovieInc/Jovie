import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { InspectorShell } from './InspectorRail';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

const meta = {
  title: 'Molecules/Inspector/InspectorShell',
  component: InspectorShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    ariaLabel: 'Release inspector',
    tabs: LIBRARY_INSPECTOR_TABS,
    activeTab: 'details' as const,
    onTabChange: fn(),
    tabsAriaLabel: 'Inspector tabs',
    objectHeader: (
      <div style={{ padding: '12px 16px' }}>
        <strong>Take Me Over</strong>
      </div>
    ),
    children: (
      <div style={{ padding: '12px 16px' }}>
        <p>Details body</p>
      </div>
    ),
  },
} satisfies Meta<typeof InspectorShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    isEmpty: true,
    emptyMessage: 'Select a library item to view details.',
    objectHeader: undefined,
    children: null,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    objectHeader: undefined,
    children: null,
  },
};
