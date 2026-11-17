import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { ProfileSection } from './ProfileSection';

/**
 * State coverage for the public profile column. These render the same section
 * as ProfileSection.stories.tsx and change only the artist record, the
 * caller's subtitle or the document direction.
 */
const meta = {
  title: 'Organisms/ProfileSection States',
  component: ProfileSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ProfileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArtist: Artist = {
  id: 'artist-states-1',
  handle: 'jordanlee',
  name: 'Jordan Lee',
  image_url:
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face',
  tagline: 'Producer and DJ making late-night house records.',
  is_verified: true,
  owner_user_id: 'user-states-1',
  spotify_id: '',
  published: true,
  is_featured: false,
  created_at: '2026-01-01T00:00:00.000Z',
  marketing_opt_out: false,
};

const listenAction = (
  <Button className='w-full' size='lg'>
    Listen Now
  </Button>
);

/** Partial: no photo and no tagline, so the avatar and subtitle fall back. */
export const PartialNoPhotoOrTagline: Story = {
  args: {
    artist: { ...baseArtist, image_url: undefined, tagline: undefined },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
  },
};

const LONG_NAME =
  'Jordan Alexander Montgomery-Lee and the Midnight Frequency Orchestra';
const LONG_SUBTITLE =
  'Live from the closing night of a three-week residency, recorded across two rooms and mixed for every speaker in the house so nothing gets lost';

/** Long content: a very long artist name and subtitle wrap in the column. */
export const LongContentNameAndSubtitle: Story = {
  args: {
    artist: { ...baseArtist, name: LONG_NAME },
    subtitle: LONG_SUBTITLE,
    children: listenAction,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_SUBTITLE)).toBeVisible();
  },
};

/** Right-to-left: an Arabic artist record inside an RTL document. */
export const RtlArabicArtist: Story = {
  args: {
    artist: {
      ...baseArtist,
      name: 'ليلى حداد',
      tagline: 'منتجة موسيقى إلكترونية من بيروت',
    },
    children: listenAction,
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('منتجة موسيقى إلكترونية من بيروت')
    ).toBeVisible();
  },
};
