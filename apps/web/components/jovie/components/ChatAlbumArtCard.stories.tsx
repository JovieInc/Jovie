import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ChatAlbumArtToolResult } from '../types';
import { ChatAlbumArtCard } from './ChatAlbumArtCard';
import { ALBUM_ART_SWIPE_PREFERENCE_KEY } from './ChatAlbumArtSwipeReview';

function ChatAlbumArtCardStoryShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <div className='w-sm max-w-full'>{children}</div>
    </QueryClientProvider>
  );
}

const generatedResult: ChatAlbumArtToolResult = {
  success: true,
  state: 'generated',
  releaseId: 'release-1',
  releaseTitle: 'Skyline Dreams',
  artistName: 'Sasha Waves',
  generationId: 'gen-1',
  hasExistingArtwork: false,
  candidates: [
    {
      id: 'candidate-1',
      styleId: 'dream-pop',
      styleLabel: 'Dream Pop',
      previewUrl: 'https://placehold.co/256x256',
      fullResUrl: 'https://placehold.co/1024x1024',
    },
    {
      id: 'candidate-2',
      styleId: 'vaporwave',
      styleLabel: 'Vaporwave',
      previewUrl: 'https://placehold.co/256x256',
      fullResUrl: 'https://placehold.co/1024x1024',
    },
  ],
};

const needsReleaseTargetResult: ChatAlbumArtToolResult = {
  success: true,
  state: 'needs_release_target',
  releaseTitle: null,
  artistName: 'Sasha Waves',
  suggestedReleases: [
    { id: 'release-1', title: 'Skyline Dreams' },
    { id: 'release-2', title: 'Neon Tide' },
  ],
};

const failedResult: ChatAlbumArtToolResult = {
  success: false,
  retryable: true,
  error: 'Album art generation failed. Please try again.',
};

const meta = {
  title: 'Jovie/ChatAlbumArtCard',
  component: ChatAlbumArtCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileId: 'story-profile',
  },
  decorators: [
    Story => (
      <ChatAlbumArtCardStoryShell>
        <Story />
      </ChatAlbumArtCardStoryShell>
    ),
  ],
} satisfies Meta<typeof ChatAlbumArtCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GeneratedCandidates: Story = {
  args: {
    result: generatedResult,
  },
};

export const LoadingApplyPending: Story = {
  args: {
    result: {
      ...generatedResult,
      candidates: [generatedResult.candidates[0]!],
    },
  },
  decorators: [
    Story => {
      globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'off');
      return <Story />;
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Apply/create mutations expose isPending; certificate scores loading from that path.',
      },
    },
  },
};

export const EmptyCandidates: Story = {
  args: {
    result: {
      ...generatedResult,
      candidates: [],
    },
  },
  decorators: [
    Story => {
      globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'off');
      return <Story />;
    },
  ],
};

export const LongContentReleaseTitle: Story = {
  args: {
    result: {
      ...generatedResult,
      releaseTitle:
        'Final International Tour Deluxe Edition Master — Midnight City Lights Remastered Anniversary Collection',
      candidates: [
        {
          ...generatedResult.candidates[0]!,
          styleLabel: 'Dream Pop Extended Label For Overflow',
        },
      ],
    },
  },
  decorators: [
    Story => {
      globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'off');
      return (
        <div className='w-56'>
          <Story />
        </div>
      );
    },
  ],
};

export const OfflineDisconnected: Story = {
  args: {
    result: failedResult,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Offline/disconnected apply path shares the failed artifact surface (retryable tool error).',
      },
    },
  },
};

export const RtlOverflowTitle: Story = {
  args: {
    result: {
      ...generatedResult,
      releaseTitle: 'ألبوم الأحلام الليلية للإصدار النهائي',
      candidates: [
        {
          ...generatedResult.candidates[0]!,
          styleLabel: 'بوب الأحلام',
        },
      ],
    },
  },
  decorators: [
    Story => {
      globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'off');
      return (
        <div dir='rtl' className='w-56'>
          <Story />
        </div>
      );
    },
  ],
};

export const SwipeReviewOnboarding: Story = {
  args: {
    result: generatedResult,
  },
  decorators: [
    Story => {
      globalThis.localStorage.removeItem(ALBUM_ART_SWIPE_PREFERENCE_KEY);
      return <Story />;
    },
  ],
};

export const SwipeReviewMode: Story = {
  args: {
    result: generatedResult,
  },
  decorators: [
    Story => {
      globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'on');
      return <Story />;
    },
  ],
};

export const NeedsReleaseTarget: Story = {
  args: {
    result: needsReleaseTargetResult,
  },
};

export const Failed: Story = {
  args: {
    result: failedResult,
  },
};
