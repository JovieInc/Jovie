import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsNavigation } from './SettingsSidebarNav';

function dashboardData(displayName: string) {
  return {
    user: { id: 'story-user' },
    creatorProfiles: [],
    selectedProfile: { id: 'story-profile', displayName },
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
  } as unknown as DashboardData;
}

function SidebarFrame({
  children,
  displayName = 'Tim White',
}: {
  readonly children: ReactNode;
  readonly displayName?: string;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <DashboardDataProvider value={dashboardData(displayName)}>
        <TooltipProvider>
          <SidebarProvider>
            <div className='flex h-160 w-full max-w-60 flex-col bg-base p-2'>
              {children}
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </DashboardDataProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/SettingsSidebarNav',
  component: SettingsNavigation,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <SidebarFrame>
        <Story />
      </SidebarFrame>
    ),
  ],
  args: { pathname: APP_ROUTES.SETTINGS_ACCOUNT, section: 'settings' },
} satisfies Meta<typeof SettingsNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Personal first, then the artist area; Account is the active item. */
export const Default: Story = {};

/** Another destination active, to show the single active item moving. */
export const TouringActive: Story = {
  args: { pathname: APP_ROUTES.SETTINGS_TOURING },
};

export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

/** A search with no match leaves one muted status line. */
export const EmptySearchResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('searchbox', { name: 'Search Settings' }),
      'zzz'
    );
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'No settings match'
    );
  },
};

/** A long artist name on the Profile item truncates inside the rail. */
export const LongContentArtistName: Story = {
  decorators: [
    Story => (
      <SidebarFrame displayName='The Extraordinarily Long Named Artist Collective Featuring Everyone'>
        <Story />
      </SidebarFrame>
    ),
  ],
};
