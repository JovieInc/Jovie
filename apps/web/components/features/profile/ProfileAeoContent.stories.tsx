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
