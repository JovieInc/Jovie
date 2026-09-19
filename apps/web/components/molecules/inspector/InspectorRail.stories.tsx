import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { InspectorShell } from './InspectorRail';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

const meta = {
  title: 'Molecules/Inspector/InspectorShell',
  component: InspectorShell,
  args: {
    isOpen: true,
    ariaLabel: 'Release inspector',
    tabs: LIBRARY_INSPECTOR_TABS,
    activeTab: 'details' as const,
    onTabChange: fn(),
    tabsAriaLabel: 'Inspector tabs',
    objectHeader: <strong>Take Me Over</strong>,
    children: <p>Details body</p>,
    isLoading: false,
  },
} satisfies Meta<typeof InspectorShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};
