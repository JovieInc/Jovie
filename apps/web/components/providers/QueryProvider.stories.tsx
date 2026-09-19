import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryProvider } from './QueryProvider';

const meta: Meta<typeof QueryProvider> = {
  title: 'Providers/QueryProvider',
  component: QueryProvider,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DashboardShell: Story = {
  args: {
    children: <p>Dashboard app shell</p>,
  },
};
