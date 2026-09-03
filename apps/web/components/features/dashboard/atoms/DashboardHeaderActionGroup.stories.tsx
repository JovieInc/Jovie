import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardHeaderActionGroup } from './DashboardHeaderActionGroup';

const meta = {
  title: 'Features/Dashboard/Atoms/DashboardHeaderActionGroup',
  component: DashboardHeaderActionGroup,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DashboardHeaderActionGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
