import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTableLoadingShell } from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import { LazyDashboardAudienceClient } from './LazyDashboardAudienceClient';

/**
 * LazyDashboardAudienceClient code-splits the audience client behind a
 * loading shell. The stories render the shell it shows while the chunk loads.
 */
const meta = {
  title: 'Dashboard/Organisms/LazyDashboardAudienceClient',
  component: LazyDashboardAudienceClient,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LazyDashboardAudienceClient>;

export default meta;
type Story = StoryObj<typeof meta>;

function LoadingFallback() {
  return <AudienceTableLoadingShell />;
}

export const Loading: Story = {
  render: LoadingFallback,
};
