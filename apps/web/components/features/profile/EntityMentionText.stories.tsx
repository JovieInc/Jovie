import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';
import { EntityMentionText } from './EntityMentionText';

const segments: EntityMentionSegment[] = [
  { type: 'text', text: 'New single ' },
  { type: 'release', text: 'The Deep End', href: '/tim/the-deep-end' },
  { type: 'text', text: ' out now, produced with ' },
  { type: 'artist', text: 'Cosmic Gate', href: '/cosmicgate' },
  { type: 'text', text: '.' },
];

const meta = {
  title: 'Features/Profile/EntityMentionText',
  component: EntityMentionText,
  parameters: {
    layout: 'centered',
  },
  args: {
    segments,
  },
} satisfies Meta<typeof EntityMentionText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PlainText: Story = {
  args: {
    segments: [{ type: 'text', text: 'No entity mentions in this bio.' }],
  },
};

/** A bio with no text yet renders nothing, so the paragraph collapses. */
export const EmptySegments: Story = {
  args: {
    segments: [],
  },
  render: args => (
    <p className='w-80 min-h-6 text-mid text-secondary-token'>
      <EntityMentionText {...args} />
    </p>
  ),
};

export const LongContentWrapping: Story = {
  args: {
    segments: [
      { type: 'text', text: 'Featured on ' },
      {
        type: 'release',
        text: 'Never Say A Word (Extended Club Mix featuring the Los Angeles Philharmonic Strings)',
        href: '/tim/never-say-a-word-extended',
      },
      { type: 'text', text: ' alongside ' },
      {
        type: 'artist',
        text: 'Cosmic Gate and the Unusually Long Collective Name Ensemble',
        href: '/cosmicgate',
      },
      {
        type: 'text',
        text: ', a run of collaborations that took the record from late-night sets to festival main stages across three continents.',
      },
    ],
  },
  render: args => (
    <p className='w-72 text-mid leading-6 text-secondary-token'>
      <EntityMentionText {...args} />
    </p>
  ),
};

export const RtlMixedDirection: Story = {
  args: {
    segments: [
      { type: 'text', text: 'أغنية جديدة ' },
      { type: 'release', text: 'The Deep End', href: '/tim/the-deep-end' },
      { type: 'text', text: ' متاحة الآن، من إنتاج ' },
      { type: 'artist', text: 'Cosmic Gate', href: '/cosmicgate' },
      { type: 'text', text: '.' },
    ],
  },
  render: args => (
    <p dir='rtl' className='w-72 text-mid leading-6 text-secondary-token'>
      <EntityMentionText {...args} />
    </p>
  ),
};
