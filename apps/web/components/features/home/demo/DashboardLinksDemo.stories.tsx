import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardLinksDemo } from './DashboardLinksDemo';

const meta = {
  title: 'Marketing/Demos/DashboardLinksDemo',
  component: DashboardLinksDemo,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DashboardLinksDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
