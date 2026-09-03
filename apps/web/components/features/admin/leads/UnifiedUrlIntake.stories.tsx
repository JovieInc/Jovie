import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UnifiedUrlIntake } from './UnifiedUrlIntake';

const meta = {
  title: 'Features/Admin/Leads/UnifiedUrlIntake',
  component: UnifiedUrlIntake,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof UnifiedUrlIntake>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
