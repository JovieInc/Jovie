import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardAudienceDemo } from './DashboardAudienceDemo';

const meta = {
  title: 'Marketing/Demos/DashboardAudienceDemo',
  component: DashboardAudienceDemo,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof DashboardAudienceDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
