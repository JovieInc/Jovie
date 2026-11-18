import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AdminQueryTabsSelect } from './AdminQueryTabsSelect';

const OPTIONS = [
  { value: 'roster', label: 'Roster' },
  { value: 'skills', label: 'Skills' },
  { value: 'connectors', label: 'Connectors' },
  { value: 'tools', label: 'Tools' },
  { value: 'memory', label: 'Memory' },
] as const;

const meta = {
  title: 'Features/Admin/Layout/AdminQueryTabsSelect',
  component: AdminQueryTabsSelect,
  parameters: {
    layout: 'padded',
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.ADMIN_SYSTEM,
        query: { tab: 'skills' },
      },
    },
  },
  args: {
    param: 'tab',
    value: 'skills',
    options: OPTIONS,
  },
} satisfies Meta<typeof AdminQueryTabsSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Skills: Story = {};

export const Memory: Story = {
  args: { value: 'memory' },
  parameters: {
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.ADMIN_SYSTEM,
        query: { tab: 'memory', page: '2' },
      },
    },
  },
};
