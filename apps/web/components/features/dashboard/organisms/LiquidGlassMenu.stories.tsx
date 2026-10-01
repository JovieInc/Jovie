import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BarChart3, Home, ListTodo, Settings, Users } from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';
import type { LiquidGlassMenuItem } from './LiquidGlassMenu';
import { LiquidGlassMenu } from './LiquidGlassMenu';

const primaryItems: LiquidGlassMenuItem[] = [
  { id: 'home', label: 'Home', href: APP_ROUTES.DASHBOARD, icon: Home },
  { id: 'audience', label: 'Audience', href: APP_ROUTES.AUDIENCE, icon: Users },
  {
    id: 'analytics',
    label: 'Analytics',
    href: APP_ROUTES.INSIGHTS,
    icon: BarChart3,
  },
];

const expandedItems: LiquidGlassMenuItem[] = [
  {
    id: 'tasks',
    label: 'Tasks',
    href: APP_ROUTES.TASKS,
    icon: ListTodo,
    badge: 3,
  },
  {
    id: 'settings',
    label: 'Settings',
    href: APP_ROUTES.SETTINGS,
    icon: Settings,
  },
];

const meta = {
  title: 'Dashboard/Organisms/LiquidGlassMenu',
  component: LiquidGlassMenu,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['item', 'inputMethod', 'items', 'pathname'],
    },
  },
  args: {
    primaryItems,
    expandedItems,
    onSearchClick: () => {},
    onSignOut: () => {},
  },
  render: args => (
    <div className='relative h-64 bg-base'>
      <LiquidGlassMenu {...args} />
    </div>
  ),
} satisfies Meta<typeof LiquidGlassMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const InFlow: Story = {
  args: {
    inFlow: true,
  },
};
