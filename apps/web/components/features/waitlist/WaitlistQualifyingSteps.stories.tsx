import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { WaitlistQualifyingSteps } from './WaitlistQualifyingSteps';

function SpotifySearchQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Waitlist/WaitlistQualifyingSteps',
  component: WaitlistQualifyingSteps,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <SpotifySearchQueryProvider>
        <form
          className='mx-auto max-w-md px-4 py-10'
          onSubmit={event => event.preventDefault()}
        >
          <Story />
        </form>
      </SpotifySearchQueryProvider>
    ),
  ],
  args: {
    step: 'artist',
    answers: { spotifyUrl: '', artistName: null, growth: '', spend: '' },
    submitting: false,
    onChange: fn(),
    onBack: fn(),
    onSkip: fn(),
  },
} satisfies Meta<typeof WaitlistQualifyingSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WhichArtist: Story = {};

export const LastGrowthAttempt: Story = {
  args: {
    step: 'growth',
    answers: {
      spotifyUrl: '',
      artistName: null,
      growth: 'Ran a pre-save for my last single. About 40 people signed up.',
      spend: '',
    },
  },
};

export const PromoSpend: Story = {
  args: {
    step: 'spend',
    answers: {
      spotifyUrl: '',
      artistName: null,
      growth: '',
      spend: 'under_50',
    },
  },
};
