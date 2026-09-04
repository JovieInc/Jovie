import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import {
  ShellReleasesView,
  type ShellReleasesViewProps,
} from './ShellReleasesView';

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1db954' },
} satisfies ShellReleasesViewProps['providerConfig'];

const primaryProviders = [
  'spotify',
] satisfies ShellReleasesViewProps['primaryProviders'];

const meta = {
  title: 'Dashboard/Releases/Shell Releases View',
  component: ShellReleasesView,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'showEmptyState',
        'showConnectedEmptyState',
        'visibleReleases',
        'selectedReleaseId',
        'pills',
        'canCreateManualReleases',
        'isSyncing',
        'actionMenusByReleaseId',
        'contextMenuItemsByReleaseId',
        'isSmartLinkLocked',
        'getSmartLinkLockReason',
        'getSyncStatus',
        'onConnectSpotify',
        'onNewRelease',
        'onSync',
        'onSelect',
        'onClearFilters',
        'isLoading',
      ],
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: APP_ROUTES.DASHBOARD_RELEASES,
        query: { connect: 'spotify' },
      },
    },
  },
  args: {
    releases: [],
    providerConfig,
    primaryProviders,
    artistName: 'Bahamas',
    spotifyConnected: false,
    initialSpotifyConnectOpen: true,
  },
  render: args => (
    <div className='h-[38rem] min-h-0 bg-(--app-shell-content-surface)'>
      <TableMetaProvider>
        <HeaderActionsProvider>
          <RightPanelProvider>
            <ShellReleasesView {...args} />
          </RightPanelProvider>
        </HeaderActionsProvider>
      </TableMetaProvider>
    </div>
  ),
} satisfies Meta<typeof ShellReleasesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifyConnection: Story = {};
