import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';

const ADAPTIVE = ARTIST_PROFILE_COPY.adaptive;

/** Rendered states of the mode switcher; defaults live in ArtistProfileModeSwitcher.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileModeSwitcher States',
  component: ArtistProfileModeSwitcher,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-surface-0 px-6 py-16 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { adaptive: ADAPTIVE },
} satisfies Meta<typeof ArtistProfileModeSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no profile modes, so the switcher renders nothing. */
export const EmptyModes: Story = {
  args: { adaptive: { ...ADAPTIVE, modes: [] } },
};

/** Partial: compact layout with two modes, no captions and no body. */
export const PartialCompactNoCaptions: Story = {
  args: {
    adaptive: { ...ADAPTIVE, body: '', modes: ADAPTIVE.modes.slice(0, 2) },
    showIntroHeading: false,
  },
};

/** Long content: a long two-line headline, body and mode headlines. */
export const LongContentIntro: Story = {
  args: {
    adaptive: {
      ...ADAPTIVE,
      headline:
        'One profile that changes with every release\nand every listener who opens it',
      body: 'Every mode changes what a listener sees first, from presaves before a drop to tickets on tour, so the profile always points at the next useful action.',
      modes: ADAPTIVE.modes.map(mode => ({
        ...mode,
        headline: `${mode.headline} This mode headline carries extra words so it wraps.`,
      })),
    },
    phoneCaption: 'Live artist profile',
    phoneSubcaption: 'Adaptive action path preview',
  },
};

/** Right-to-left: Arabic intro copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    adaptive: {
      ...ADAPTIVE,
      headline: 'ملف واحد\nيتغير مع كل إصدار',
      body: 'يتغير ما يراه المستمع أولًا مع كل وضع.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
