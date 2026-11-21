import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries';
import { ReleaseTrackList } from './ReleaseTrackList';
import { release, track } from './releaseTrackList.test-fixtures';

function clientFor(state: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, refetchOnMount: false },
    },
  });
  const key = queryKeys.releases.tracks(release.id);
  if (state === 'loading') {
    const query = client
      .getQueryCache()
      .build(client, { queryKey: key, queryFn: () => new Promise(() => {}) });
    void query.fetch();
  }
  if (state === 'error')
    client
      .getQueryCache()
      .build(client, { queryKey: key })
      .setState({
        status: 'error',
        error: new Error('Tracks unavailable'),
        fetchStatus: 'idle',
      });
  return client;
}
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseTrackList States',
  component: ReleaseTrackList,
  args: { release },
  loaders: [
    ({ parameters }) => ({
      client: clientFor(String(parameters.trackState ?? 'data')),
    }),
  ],
  decorators: [
    function QueryFrame(Story, context) {
      return (
        <QueryClientProvider client={context.loaded.client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta<typeof ReleaseTrackList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LoadingTracks: Story = { parameters: { trackState: 'loading' } };
export const ErrorTracks: Story = { parameters: { trackState: 'error' } };
export const OfflineTracks: Story = { parameters: { trackState: 'error' } };
export const PartialTracks: Story = { args: { tracksOverride: [track] } };
export const LongContentTrack: Story = {
  args: {
    tracksOverride: [
      {
        ...track,
        title:
          'A track with a particularly long name that must remain readable in the release sidebar',
      },
    ],
  },
};
export const RtlTracks: Story = {
  args: { tracksOverride: [{ ...track, title: 'أغنية' }] },
  decorators: [
    function Rtl(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
