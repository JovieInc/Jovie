import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LeadPipelineControls } from './LeadPipelineControls';

const meta = {
  title: 'Features/Admin/Leads/LeadPipelineControls',
  component: LeadPipelineControls,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LeadPipelineControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
