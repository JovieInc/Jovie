import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PreviewDataHydrator } from '../PreviewDataHydrator';
import { ProfileContactSidebar } from './ProfileContactSidebar';

const meta = {
  title: 'Dashboard/ProfileContactSidebar',
  component: ProfileContactSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [withDashboardProviders, withSignedInSession],
} satisfies Meta<typeof ProfileContactSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = {
  render: () => (
    <PreviewPanelProvider defaultOpen>
      <ProfileContactSidebar />
    </PreviewPanelProvider>
  ),
};
export const Hydrated: Story = {
  render: () => (
    <PreviewPanelProvider defaultOpen>
      <PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />
      <ProfileContactSidebar />
    </PreviewPanelProvider>
  ),
};
