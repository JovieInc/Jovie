import { RenderedSidebarFamily } from '@/.storybook/rendered-family';
import '../../styles/system-b-app.css';
import { Button, TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Profiler, useEffect, useMemo, useState } from 'react';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AskJovieMark } from '@/components/ask-jovie/AskJovie';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
import { RuntimeUpdateProvider } from '@/components/shell/RuntimeUpdateProvider';
import { SidebarMoreMenu } from '@/components/shell/SidebarMoreMenu';
import { useSidebarPageSearch } from '@/components/shell/useSidebarPageSearch';
import { APP_ROUTES } from '@/constants/routes';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  ShellSidebarOverrideProvider,
  useRegisterShellSidebarOverride,
} from '@/contexts/ShellSidebarOverrideContext';
import { calendarNavItem } from '@/features/dashboard/dashboard-nav/config';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { useDesktopWorkState } from '@/lib/desktop/session-work-state';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { queryKeys } from '@/lib/queries/keys';
import { AppShellFrame } from './AppShellFrame';
import { CommandPalette, CommandPaletteMainSurface } from './CommandPalette';
import { PersistentAudioBar } from './PersistentAudioBar';
import { useTrackAudioPlayer } from './release-sidebar/useTrackAudioPlayer';
import { UnifiedSidebar } from './UnifiedSidebar';

function StorySidebarProvider({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

queryClient.setQueryData(queryKeys.chat.conversations(), [
  {
    id: 'merch',
    title: 'Merch drop checklist',
    updatedAt: new Date(Date.now() - 120_000).toISOString(),
    latestTurnStatus: 'completed',
  },
  {
    id: 'tour',
    title: 'Tour announce — caption drafts',
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    latestTurnStatus: 'completed',
  },
  {
    id: 'fans',
    title: 'Fan segment Q3 planning',
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    latestTurnStatus: 'completed',
  },
]);

const dashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [
    {
      id: 'story-profile',
      avatarUrl: null,
      displayName: 'Tim White',
      username: 'timwhite',
      usernameNormalized: 'timwhite',
    } as DashboardData['creatorProfiles'][number],
  ],
  selectedProfile: {
    id: 'story-profile',
    avatarUrl: null,
    displayName: 'Tim White',
    username: 'timwhite',
    usernameNormalized: 'timwhite',
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
  inboxNavigation: { state: 'empty', pendingCount: 0 },
};

const meta: Meta<typeof UnifiedSidebar> = {
  title: 'Organisms/UnifiedSidebar',
  component: UnifiedSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    withSignedInSession,
    (Story, context) => (
      <QueryClientProvider client={queryClient}>
        <AppFlagProvider
          initialFlags={{ ...APP_FLAG_DEFAULTS, PROFILES_WORKSPACE: true }}
        >
          <DashboardDataProvider value={dashboardData}>
            <TooltipProvider>
              <StorySidebarProvider>
                <JovieAuthValuesProvider>
                  <HeaderActionsProvider>
                    <RuntimeUpdateProvider>
                      <ShellSidebarOverrideProvider>
                        {context.parameters.sharedShell ? (
                          <Story />
                        ) : (
                          <RenderedSidebarFamily
                            name='unified-sidebar'
                            owner='UnifiedSidebar'
                          >
                            <div className='h-screen w-(--app-shell-sidebar-width)'>
                              <Story />
                            </div>
                          </RenderedSidebarFamily>
                        )}
                      </ShellSidebarOverrideProvider>
                    </RuntimeUpdateProvider>
                  </HeaderActionsProvider>
                </JovieAuthValuesProvider>
              </StorySidebarProvider>
            </TooltipProvider>
          </DashboardDataProvider>
        </AppFlagProvider>
      </QueryClientProvider>
    ),
  ],
  args: {
    section: 'dashboard',
    variant: 'jovie',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {};

function SidebarExperienceFrame({
  section,
  variant,
  media = false,
  inspector = false,
}: React.ComponentProps<typeof UnifiedSidebar> & {
  readonly media?: boolean;
  readonly inspector?: boolean;
}) {
  const { open, isMobile } = useSidebar();
  const { isCommandPaletteOpen, commandPaletteHeader, commandPalettePages } =
    useHeaderActions();
  useEffect(() => {
    const target = window as unknown as {
      sidebarFixturePages?: { id: string; label: string; href: string }[];
      sidebarFixtureNavigation?: () => unknown[][];
    };
    target.sidebarFixturePages = commandPalettePages?.map(
      ({ id, label, href }) => ({ id, label, href })
    );
    target.sidebarFixtureNavigation = () => getRouter().push.mock.calls;
  }, [commandPalettePages]);
  const [draft, setDraft] = useState('A saved release draft');
  useDesktopWorkState({
    hasDraft: media && draft.length > 0,
    isStreaming: false,
    isUploading: false,
    hasPendingAction: false,
    isAuthenticating: false,
  });
  const player = useTrackAudioPlayer();
  return (
    <AppShellFrame
      brandVariant={variant}
      sidebar={
        <UnifiedSidebar
          section={section}
          variant={variant}
          headerOwnsCollapsedToggle
        />
      }
      header={
        <DashboardHeader
          commandPaletteHeader={commandPaletteHeader}
          sidebarTriggerOnMobile
          breadcrumbs={[{ label: 'Home' }]}
          sidebarTrigger={
            !open || isMobile ? (
              <div
                className={
                  isMobile
                    ? 'flex items-center gap-1.5'
                    : '-ml-3 flex items-center gap-1.5'
                }
              >
                <AskJovieMark variant={variant} railOwner='left' />
                <SidebarCollapseButton />
              </div>
            ) : undefined
          }
        />
      }
      main={
        <>
          <CommandPalette />
          {isCommandPaletteOpen ? (
            <Profiler
              id='sidebar-page-search'
              onRender={(_id, phase, duration) => {
                const target = window as unknown as {
                  sidebarPaletteRenderSamples?: {
                    phase: string;
                    duration: number;
                  }[];
                };
                (target.sidebarPaletteRenderSamples ??= []).push({
                  phase,
                  duration,
                });
              }}
            >
              <CommandPaletteMainSurface />
            </Profiler>
          ) : (
            <div
              data-testid='sidebar-experience-content'
              className={
                media
                  ? 'flex h-full min-h-0 flex-col'
                  : 'h-full overflow-y-auto'
              }
            >
              <div
                className={
                  media
                    ? 'min-h-0 flex-1 overflow-y-auto px-3 py-4 text-sm text-secondary-token'
                    : 'h-64 px-3 py-4 text-sm text-secondary-token'
                }
              >
                Your workspace
                {media ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    type='button'
                    onClick={() => {
                      const bytes = new Uint8Array(44 + 8000);
                      const view = new DataView(bytes.buffer);
                      const write = (offset: number, value: string) =>
                        [...value].forEach((char, index) => {
                          bytes[offset + index] = char.charCodeAt(0);
                        });
                      write(0, 'RIFF');
                      view.setUint32(4, bytes.length - 8, true);
                      write(8, 'WAVE');
                      write(12, 'fmt ');
                      view.setUint32(16, 16, true);
                      view.setUint16(20, 1, true);
                      view.setUint16(22, 1, true);
                      view.setUint32(24, 16000, true);
                      view.setUint32(28, 32000, true);
                      view.setUint16(32, 2, true);
                      view.setUint16(34, 16, true);
                      write(36, 'data');
                      view.setUint32(40, 8000, true);
                      void player.toggleTrack({
                        id: 'sidebar-sample',
                        title: 'Sidebar sample',
                        artistName: 'Test fixture',
                        audioUrl: `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`,
                      });
                    }}
                  >
                    Load sample track
                  </Button>
                ) : null}
              </div>
              {media ? (
                <div className='shrink-0 px-3 pb-3'>
                  <ChatInput
                    value={draft}
                    onChange={setDraft}
                    onSubmit={() => undefined}
                    isLoading={false}
                    dictationEnabled={false}
                    variant='default'
                  />
                </div>
              ) : (
                <div className='h-96 px-3 text-sm text-secondary-token'>
                  Activity
                </div>
              )}
            </div>
          )}
        </>
      }
      rightPanel={
        inspector ? (
          <div
            className='h-full w-64 bg-surface-1 p-3'
            data-testid='sidebar-inspector-fixture'
          >
            <Button variant='ghost' size='sm' type='button'>
              Inspector action
            </Button>
          </div>
        ) : undefined
      }
      audioPlayer={media ? <PersistentAudioBar /> : undefined}
    />
  );
}

export const SharedShell: Story = {
  parameters: {
    sharedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.DASHBOARD } },
  },
  render: args => <SidebarExperienceFrame {...args} />,
};
export const OperatorSharedShell: Story = {
  render: args => <SidebarExperienceFrame {...args} />,
  parameters: {
    sharedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.ADMIN_CHAT } },
  },
  args: { section: 'ov', variant: 'ov' },
};

export const SharedMediaShell: Story = {
  parameters: {
    sharedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.DASHBOARD } },
  },
  render: args => <SidebarExperienceFrame {...args} media />,
};

export const LegacyAdmin: Story = {
  args: { section: 'admin' },
  parameters: {
    nextjs: { navigation: { pathname: APP_ROUTES.LEGACY_ADMIN } },
  },
};

export const Demo: Story = {
  parameters: { nextjs: { navigation: { pathname: APP_ROUTES.DEMO } } },
};

export const Settings: Story = {
  args: {
    section: 'settings',
  },
};

export const Operator: Story = {
  parameters: { nextjs: { navigation: { pathname: APP_ROUTES.ADMIN_CHAT } } },
  args: {
    section: 'ov',
    variant: 'ov',
  },
};

function LongRecentFixture(args: React.ComponentProps<typeof UnifiedSidebar>) {
  const [client] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      queryKeys.chat.conversations(),
      Array.from({ length: 50 }, (_, index) => ({
        id: `long-${index}`,
        title: `A long conversation title about release preparation, touring and audience follow-up ${index}`,
        updatedAt: new Date(Date.now() - index * 3600000).toISOString(),
        latestTurnStatus:
          index === 0
            ? 'streaming'
            : index === 1
              ? 'failed_timeout'
              : 'completed',
        latestMessageRole: 'assistant',
      }))
    );
    return client;
  });
  return (
    <QueryClientProvider client={client}>
      <SidebarExperienceFrame {...args} />
    </QueryClientProvider>
  );
}

export const LongRecentShell: Story = {
  parameters: {
    sharedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.DASHBOARD } },
  },
  render: args => <LongRecentFixture {...args} />,
};

export const InspectorMediaShell: Story = {
  parameters: {
    sharedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.DASHBOARD } },
  },
  render: args => <SidebarExperienceFrame {...args} media inspector />,
};

// Authorized test input uses existing NavItem contracts and an existing route.
// These fixture IDs and labels never enter the production registry.
const scalePages = Array.from({ length: 120 }, (_, index) => ({
  ...calendarNavItem,
  id: `scale-page-${index}`,
  name: `Calendar page fixture ${index + 1}: a long authorized destination label`,
}));
const scalePageInactive = () => false;

function LargeMoreFixture(args: React.ComponentProps<typeof UnifiedSidebar>) {
  const openPages = useSidebarPageSearch(scalePages);
  const override = useMemo(
    () => ({
      key: 'sidebar-more-scale',
      backHref: APP_ROUTES.DASHBOARD,
      backLabel: 'Home',
      content: (
        <Profiler
          id='sidebar-large-more'
          onRender={(_id, phase, actualDuration) => {
            const target = window as unknown as {
              sidebarScaleRenderSamples?: { phase: string; duration: number }[];
            };
            (target.sidebarScaleRenderSamples ??= []).push({
              phase,
              duration: actualDuration,
            });
          }}
        >
          <SidebarMoreMenu
            items={scalePages}
            isActive={scalePageInactive}
            onFindPage={openPages}
          />
        </Profiler>
      ),
    }),
    [openPages]
  );
  useRegisterShellSidebarOverride(override);
  return <SidebarExperienceFrame {...args} />;
}

export const LargeMoreShell: Story = {
  parameters: {
    sharedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.DASHBOARD } },
  },
  render: args => <LargeMoreFixture {...args} />,
};
