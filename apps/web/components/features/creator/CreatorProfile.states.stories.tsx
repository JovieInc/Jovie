import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { PublicProfileData } from '@/lib/queries/usePublicProfileQuery';
import { CreatorProfile } from './CreatorProfile';

/**
 * State coverage for the creator profile card. The canonical story in
 * CreatorProfile.stories.tsx shows the backend-less error. These seed the same
 * public profile query the component reads through useCreator.
 */
const USERNAME = 'sample-artist';

const CREATOR: PublicProfileData = {
  id: 'creator-1',
  username: USERNAME,
  usernameNormalized: USERNAME,
  displayName: 'Sample Artist',
  bio: 'Producer and DJ. New single out now.',
  avatarUrl: null,
  creatorType: 'artist',
  spotifyUrl: 'https://open.spotify.com/artist/sample',
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: 'sample',
  isPublic: true,
  isVerified: true,
  isClaimed: true,
  isFeatured: false,
  marketingOptOut: false,
  settings: null,
  theme: null,
  socialLinks: [
    {
      id: 'link-1',
      platform: 'instagram',
      platformType: 'social',
      url: 'https://instagram.com/sample',
      displayText: 'Instagram',
      clicks: 0,
      isActive: true,
      sortOrder: 0,
    },
  ],
};

type Seed =
  | { readonly kind: 'data'; readonly data: PublicProfileData }
  | { readonly kind: 'error'; readonly error: Error }
  | { readonly kind: 'loading' };

function ProfileQuery({
  seed,
  children,
}: {
  readonly seed: Seed;
  readonly children: ReactNode;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const queryKey = queryKeys.profile.byUsername(USERNAME);
    if (seed.kind === 'data') queryClient.setQueryData(queryKey, seed.data);
    else
      void queryClient.prefetchQuery({
        queryKey,
        queryFn: () =>
          seed.kind === 'error'
            ? Promise.reject(seed.error)
            : new Promise<PublicProfileData>(() => {}),
      });
    return queryClient;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withProfile(seed: Seed) {
  return function ProfileDecorator(Story: () => ReactNode) {
    return (
      <ProfileQuery seed={seed}>
        <div className='w-full max-w-2xl'>
          <Story />
        </div>
      </ProfileQuery>
    );
  };
}

const meta = {
  title: 'Features/Creator/CreatorProfile States',
  component: CreatorProfile,
  parameters: { layout: 'padded' },
  args: { username: USERNAME },
} satisfies Meta<typeof CreatorProfile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first profile read is still in flight. */
export const LoadingFirstRead: Story = {
  decorators: [withProfile({ kind: 'loading' })],
};

/** Empty: a claimed profile with no bio, links or release yet. */
export const EmptyProfile: Story = {
  decorators: [
    withProfile({
      kind: 'data',
      data: {
        ...CREATOR,
        bio: null,
        spotifyUrl: null,
        isVerified: false,
        socialLinks: [],
      },
    }),
  ],
};

/** Error: the profile read failed. */
export const ErrorLoadFailed: Story = {
  decorators: [
    withProfile({ kind: 'error', error: new Error('Profile not found') }),
  ],
};

/** Long content: a long name, a long bio and the full set of links. */
export const LongContentBioAndLinks: Story = {
  decorators: [
    withProfile({
      kind: 'data',
      data: {
        ...CREATOR,
        displayName: 'The Extremely Long Named Artist Collective and Friends',
        bio: 'Producer, DJ and label owner from Los Angeles, touring every summer and releasing a new single every month, with remixes, live sets and a weekly radio show that runs long past midnight.',
        socialLinks: Array.from({ length: 8 }, (_, index) => ({
          ...CREATOR.socialLinks[0],
          id: `link-${index}`,
          displayText: `Platform link number ${index + 1}`,
          sortOrder: index,
        })),
      },
    }),
  ],
};

/** Offline: the read fails at the network, so the error card shows. */
export const OfflineNetworkFailure: Story = {
  decorators: [
    withProfile({ kind: 'error', error: new TypeError('Failed to fetch') }),
  ],
};

/** Right-to-left: the loaded profile inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
    withProfile({
      kind: 'data',
      data: { ...CREATOR, displayName: 'فنان تجريبي', bio: 'منتج ودي جي.' },
    }),
  ],
};
