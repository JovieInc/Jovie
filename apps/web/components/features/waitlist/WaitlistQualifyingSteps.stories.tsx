import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  ARTIST_LINK_ERROR,
  GROWTH_ANSWER_MAX,
  WaitlistQualifyingSteps,
} from './WaitlistQualifyingSteps';

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

/** Nothing written yet: the empty growth answer shows its full character budget. */
export const EmptyGrowthAnswer: Story = {
  args: { step: 'growth' },
};

/** Continue on a pasted album link stops on the step and says why. */
export const ErrorLinkNamesNoArtist: Story = {
  args: {
    answers: {
      spotifyUrl: 'https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo',
      artistName: null,
      growth: '',
      spend: '',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      ARTIST_LINK_ERROR
    );
  },
};

/** A long chosen artist name truncates beside Change. */
export const LongContentChosenArtist: Story = {
  args: {
    answers: {
      spotifyUrl: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
      artistName:
        'The Extraordinarily Long Named Collective Of Late Night Synth Players',
      growth: '',
      spend: '',
    },
  },
};

/** A growth answer at the character limit stays inside the fixed-height step. */
export const LongContentGrowthAnswer: Story = {
  args: {
    step: 'growth',
    answers: {
      spotifyUrl: '',
      artistName: null,
      growth:
        'Ran a pre-save for my last single, posted the snippet daily for two weeks, paid for a playlist pitch and played the track out at every set. '
          .repeat(5)
          .slice(0, GROWTH_ANSWER_MAX),
      spend: '',
    },
  },
};

/** The spend step inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    step: 'spend',
    answers: {
      spotifyUrl: '',
      artistName: null,
      growth: '',
      spend: '50_plus',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
