import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import type { HeaderSearchAdapter } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurface } from './HeaderSearchSurface';
import type { HeaderSearchCatalog } from './header-search-results';

const catalog: HeaderSearchCatalog = {
  conversations: [
    {
      id: 'story-thread-midnight',
      title: 'Midnight rollout plan',
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    },
  ],
  profiles: [
    {
      id: 'story-profile-midnight',
      displayName: 'Midnight Artist',
      username: 'midnight-artist',
      usernameNormalized: 'midnight-artist',
      provider: 'spotify',
    },
  ],
  releases: [
    {
      id: 'story-release-midnight-drive',
      title: 'Midnight Drive',
      artistNames: ['Midnight Artist'],
      smartLinkPath: '/midnight-artist/midnight-drive',
      provider: 'spotify',
    },
  ],
};

const emptyCatalog: HeaderSearchCatalog = {
  conversations: [],
  profiles: [],
  releases: [],
};

const adapter: HeaderSearchAdapter = {
  key: 'story-releases',
  pills: [],
  onPillsChange: _next => undefined,
  artistOptions: ['Midnight Artist'],
  titleOptions: ['Midnight Drive'],
  albumOptions: ['After Hours Ledger'],
  statusOptions: ['Draft', 'Scheduled', 'Live'],
  approvalOptions: ['Approved', 'Needs review'],
  hasOptions: ['Canvas', 'Spotify URL'],
  totalCount: 12,
  visibleCount: 8,
  triggerLabel: 'Search Releases',
  ariaLabel: 'Filter Search Releases',
  placeholder: 'Filter releases',
  allowedFields: ['artist', 'title', 'album', 'status', 'approval', 'has'],
};

const meta = {
  title: 'Shell/HeaderSearchSurface',
  component: HeaderSearchSurface,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='min-h-96 w-[22rem] bg-(--app-shell-content-surface) p-6'>
        <Story />
      </div>
    ),
  ],
  args: {
    adapter,
    catalog,
    isLoading: false,
    isOpen: true,
    onOpen: () => undefined,
    onClose: () => undefined,
    className: '',
  },
} satisfies Meta<typeof HeaderSearchSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

export const GlobalResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('combobox', {
      name: 'Search Jovie',
    });
    await userEvent.type(input, 'midnight');
  },
};

export const FilterSuggestions: Story = {
  args: {
    catalog: emptyCatalog,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('combobox', {
      name: 'Search Jovie',
    });
    await userEvent.type(input, 'midnight');
  },
};

export const LoadingResults: Story = {
  args: {
    adapter: null,
    catalog: emptyCatalog,
    isLoading: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('combobox', {
      name: 'Search Jovie',
    });
    await userEvent.type(input, 'searching');
  },
};

export const RemoteError: Story = {
  args: {
    adapter: null,
    catalog: emptyCatalog,
    remoteSearchScopeKey: 'story-profile',
    searchLibraryAssets: async (query: string, signal: AbortSignal) => {
      void query;
      void signal;
      throw new Error('Storybook remote search failure');
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('combobox', {
      name: 'Search Jovie',
    });
    await userEvent.type(input, 'unavailable');
    await new Promise(resolve => globalThis.setTimeout(resolve, 300));
  },
};
