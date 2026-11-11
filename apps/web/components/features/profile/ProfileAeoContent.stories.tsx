import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';
import { ProfileAeoContent } from './ProfileAeoContent';

const content = {
  artistName: 'Tim White',
  profileUrl: 'https://jovie.dev/timwhite',
  facts: [
    { label: 'Based in', value: 'Los Angeles' },
    { label: 'Active since', value: '2018' },
    { label: 'Genres', value: 'Tech house, club' },
  ],
  listenLinks: [
    {
      id: 'spotify',
      platform: 'spotify',
      label: 'Spotify',
      url: 'https://open.spotify.com/artist/4u',
    },
  ],
  followLinks: [
    {
      id: 'instagram',
      platform: 'instagram',
      label: 'Instagram',
      url: 'https://instagram.com/timwhite',
    },
  ],
  description: [
    'Tim White is a producer, songwriter, and after-hours romantic.',
  ],
  descriptionBlocks: [
    {
      kind: 'bio',
      text: 'Tim White is a producer, songwriter, and after-hours romantic.',
    },
  ],
  descriptionSegments: [
    [
      {
        type: 'text',
        text: 'Tim White is a producer, songwriter, and after-hours romantic.',
      },
    ],
  ],
  faqs: [
    {
      question: 'Where is Tim White based?',
      answer: 'Los Angeles.',
      source: { label: 'Jovie profile', href: '/timwhite' },
    },
  ],
} satisfies ProfileAeoContentModel;

const meta = {
  title: 'Profile/ProfileAeoContent',
  component: ProfileAeoContent,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['claimHref'] },
  },
  args: {
    content,
  },
  decorators: [
    Story => (
      <div className='bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileAeoContent>;

export default meta;

export const Default: StoryObj<typeof meta> = {};

export const SparseHonesty: StoryObj<typeof meta> = {
  args: {
    content: { ...content, facts: [], faqs: [] },
  },
};

/** A new profile with no facts, links, bio or FAQs: heading and share only. */
export const EmptyNewProfile: StoryObj<typeof meta> = {
  args: {
    content: {
      ...content,
      facts: [],
      listenLinks: [],
      followLinks: [],
      description: [],
      descriptionBlocks: [],
      descriptionSegments: [],
      faqs: [],
    },
  },
};

const longName = 'Tim White and the Los Angeles After Hours Orchestra';
const longBio =
  'Tim White is a producer, songwriter, DJ and after-hours romantic whose records score late-night drives, sunrise sets and the long walk home from the club.';
const longTour =
  'The project tours clubs and festivals across North America and Europe, releasing on independent labels between residencies in Los Angeles.';

/** A long name, truncated fact values, a two-paragraph bio and the claim card. */
export const LongContentFullProfile: StoryObj<typeof meta> = {
  args: {
    claimHref: '/start',
    content: {
      ...content,
      artistName: longName,
      facts: [
        ...content.facts,
        { label: 'Labels', value: 'Armada, Anjunadeep, Spinnin Records' },
      ],
      description: [longBio, longTour],
      descriptionBlocks: [
        { kind: 'bio', text: longBio },
        { kind: 'bio', text: longTour },
      ],
      descriptionSegments: [
        [{ type: 'text', text: longBio }],
        [{ type: 'text', text: longTour }],
      ],
      faqs: [
        {
          question: `What kind of music does ${longName} make?`,
          answer: longBio,
          source: { label: 'Jovie profile', href: '/timwhite' },
        },
      ],
    },
  },
};

/** The About section inside a right-to-left page. */
export const Rtl: StoryObj<typeof meta> = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
