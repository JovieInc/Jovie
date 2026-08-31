import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTableLoadingShell } from './AudienceTableLoadingShell';

const meta = {
  title:
    'Features/Dashboard/Organisms/DashboardAudienceTable/AudienceTableLoadingShell',
  component: AudienceTableLoadingShell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AudienceTableLoadingShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
