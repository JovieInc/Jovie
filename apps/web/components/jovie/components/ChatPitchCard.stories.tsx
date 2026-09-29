import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatPitchCard } from './ChatPitchCard';

const meta = {
  title: 'Jovie/ChatPitchCard',
  component: ChatPitchCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    state: 'success',
    releaseTitle: 'Midnight Drive',
    pitches: {
      spotify: 'A driving synth-pop single built for late-night playlists.',
      appleMusic: 'Midnight Drive blends synth-pop with driving rhythms.',
      amazon: 'A synth-pop single perfect for late-night listening.',
      generic: 'Midnight Drive is a new synth-pop single.',
    },
  },
} satisfies Meta<typeof ChatPitchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultiPlatform: Story = {};

export const SingleDraft: Story = {
  args: {
    pitches: undefined,
    pitch: {
      destinationLabel: 'Spotify editorial',
      subjectLine: 'New single: Midnight Drive',
      body: 'A driving synth-pop single built for late-night playlists.',
    },
  },
};

export const Loading: Story = {
  args: {
    state: 'loading',
    pitches: undefined,
  },
};

export const ErrorState: Story = {
  args: {
    state: 'error',
    pitches: undefined,
    error: 'Something went wrong generating the pitch.',
  },
};
