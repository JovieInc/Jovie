import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatPitchCard } from './ChatPitchCard';

const meta = {
  title: 'Jovie/ChatPitchCard/States',
  component: ChatPitchCard,
  parameters: { layout: 'centered' },
  decorators: [
    function PitchFrame(Story) {
      return (
        <div className='w-96 bg-base p-3'>
          <Story />
        </div>
      );
    },
  ],
  args: { state: 'success', releaseTitle: 'Midnight Drive' },
} satisfies Meta<typeof ChatPitchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a finished run with no pitch text renders nothing. */
export const EmptyNoPitch: Story = {};

/** Partial: only some platforms returned copy; the rest are hidden. */
export const PartialSomePlatforms: Story = {
  args: {
    pitches: {
      spotify: 'A driving synth-pop single built for late-night playlists.',
      appleMusic: '',
      amazon: '',
      generic: 'Midnight Drive is a new synth-pop single.',
    },
  },
};

/** Long content: a long draft clamps behind a show more toggle. */
export const LongContentClamped: Story = {
  args: {
    pitch: {
      destinationLabel: 'Spotify editorial',
      subjectLine: 'New single: Midnight Drive',
      body: 'Midnight Drive is a driving synth-pop single built for late-night playlists. It pairs a pulsing bassline with bright, widescreen synths, and it follows a run of sold-out club dates where the track closed every set. The release lands on Friday with a video shot on location, a remix pack for DJs and a limited vinyl pressing for the fans who have asked for one since the first demo leaked.',
    },
  },
};

/** Rtl: pitch copy mirrors in a right-to-left layout. */
export const RtlPitch: Story = {
  args: {
    pitch: {
      destinationLabel: 'سبوتيفاي',
      subjectLine: 'أغنية جديدة',
      body: 'أغنية سينث بوب مناسبة لقوائم الليل.',
    },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-96 bg-base p-3'>
          <Story />
        </div>
      );
    },
  ],
};
