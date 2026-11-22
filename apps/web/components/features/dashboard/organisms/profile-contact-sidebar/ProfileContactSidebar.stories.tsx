import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PreviewDataHydrator } from '../PreviewDataHydrator';
import { ProfileContactSidebar } from './ProfileContactSidebar';

// These stories exercise the argless dashboard surface, not the internal chat prop.
function DashboardProfileContactSidebar() {
  return <ProfileContactSidebar />;
}

const meta = {
  title: 'Dashboard/ProfileContactSidebar',
  component: DashboardProfileContactSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [withDashboardProviders, withSignedInSession],
} satisfies Meta<typeof DashboardProfileContactSidebar>;
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
