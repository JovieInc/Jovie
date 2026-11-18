import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import {
  EntityResolutionProvider,
  useEntityResolution,
} from './EntityResolutionProvider';

type CacheMode = 'pending' | 'success' | 'error';

interface DemoProps {
  readonly releases: readonly Partial<ReleaseViewModel>[];
  readonly mode: CacheMode;
}

const PROFILE_ID = 'profile-1';

function release(
  overrides: Partial<ReleaseViewModel>
): Partial<ReleaseViewModel> {
  return {
    id: 'rel_1',
    profileId: PROFILE_ID,
    title: 'Midnight Drive',
    status: 'released' as const,
    artworkUrl: 'https://placehold.co/64x64/111827/f5f5f5?text=MD',
    releaseType: 'single',
    ...overrides,
  };
}

function ResolvedChip() {
  const { ref } = useEntityResolution('release', 'rel_1');
  if (!ref) {
    return (
      <p className='text-sm text-secondary-token'>
        Midnight Drive (no cached match, label only)
      </p>
    );
  }
  return (
    <div className='flex max-w-xs items-center gap-2 rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-sm text-primary-token'>
      {ref.thumbnail ? (
        <img
          src={ref.thumbnail}
          alt=''
          className='h-5 w-5 shrink-0 rounded-full object-cover'
        />
      ) : null}
      <span className='min-w-0 truncate'>{ref.label}</span>
    </div>
  );
}

/** Fills the release matrix cache the way the slash menu would. */
function EntityResolutionStatesDemo({ releases, mode }: DemoProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const key = queryKeys.releases.matrix(PROFILE_ID);
  if (mode === 'pending') {
    queryClient.getQueryCache().build(queryClient, { queryKey: key });
  } else {
    queryClient.setQueryData(key, releases as ReleaseViewModel[]);
    if (mode === 'error') {
      queryClient
        .getQueryCache()
        .find({ queryKey: key })
        ?.setState({ status: 'error', error: new Error('Access revoked') });
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <EntityResolutionProvider profileId={PROFILE_ID}>
        <ResolvedChip />
      </EntityResolutionProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Jovie/EntityResolutionProvider States',
  component: EntityResolutionStatesDemo,
  parameters: { layout: 'centered' },
  args: { releases: [release({})], mode: 'success' },
} satisfies Meta<typeof EntityResolutionStatesDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the matrix query exists but has not filled; the chip stays label-only. */
export const LoadingMatrixNotFilled: Story = { args: { mode: 'pending' } };

/** Empty: the matrix loaded with no releases. */
export const EmptyMatrix: Story = { args: { releases: [] } };

/** Error: the last read failed, so cached artwork and titles are withheld. */
export const ErrorReadFailed: Story = { args: { mode: 'error' } };

/** Partial: the release resolves without artwork. */
export const PartialNoArtwork: Story = {
  args: { releases: [release({ artworkUrl: undefined })] },
};

/** Long content: a release title past the chip width truncates. */
export const LongContentTitle: Story = {
  args: {
    releases: [
      release({
        title:
          'Midnight Drive (Extended Club Mix featuring the Sunset Strings and Choir) [Remastered]',
      }),
    ],
  },
};

/** Offline: the resolver never fetches, so a filled cache still resolves. */
export const OfflineCachedMatrix: Story = {};

/** Right-to-left: an Arabic release title in an Arabic document. */
export const RtlArabicTitle: Story = {
  args: { releases: [release({ title: 'قيادة منتصف الليل' })] },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
