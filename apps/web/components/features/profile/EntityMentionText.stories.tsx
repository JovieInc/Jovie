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
