import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import {
  EntityResolutionProvider,
  useEntityResolution,
} from './EntityResolutionProvider';

const mockReleases = [
  {
    id: 'rel_1',
    title: 'Midnight Drive',
    status: 'released',
    artworkUrl: 'https://placehold.co/64x64/111827/f5f5f5?text=MD',
    releaseType: 'single',
  },
] as unknown as ReleaseViewModel[];

function ResolvedChip() {
  const { ref, isLoading } = useEntityResolution('release', 'rel_1');
  if (isLoading) {
    return <p className='text-sm text-secondary-token'>Resolving…</p>;
  }
  if (!ref) {
    return (
      <p className='text-sm text-secondary-token'>No cached match found.</p>
    );
  }
  return (
    <div className='flex items-center gap-2 rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-sm text-primary-token'>
      {ref.thumbnail && (
        <img
          src={ref.thumbnail}
          alt=''
          className='h-5 w-5 rounded-full object-cover'
        />
      )}
      {ref.label}
    </div>
  );
}

function EntityResolutionDemo({ profileId }: { readonly profileId: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.releases.matrix(profileId), mockReleases);

  return (
    <QueryClientProvider client={queryClient}>
      <EntityResolutionProvider profileId={profileId}>
        <ResolvedChip />
      </EntityResolutionProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Jovie/EntityResolutionProvider',
  component: EntityResolutionDemo,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileId: 'profile-1',
  },
} satisfies Meta<typeof EntityResolutionDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Resolved: Story = {};

export const NoProfile: Story = {
  args: {
    profileId: '',
  },
};
