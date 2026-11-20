import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityPreviewPane } from './EntityPreviewPane';

const meta = {
  title: 'Jovie/EntityPreviewPane',
  component: EntityPreviewPane,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: { entity: { kind: 'artist', id: 'sasha', label: 'Sasha Waves' } },
} satisfies Meta<typeof EntityPreviewPane>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PersonFallback: Story = {};
export const Release: Story = {
  args: {
    entity: {
      kind: 'release',
      id: 'release',
      label: 'Never Say a Word',
      thumbnail: '/img/releases/never-say-a-word.jpg',
      meta: { kind: 'release', releaseType: 'single', totalTracks: 1 },
    },
  },
};
export const CalendarEvent: Story = {
  args: {
    entity: {
      kind: 'event',
      id: 'event',
      label: 'The Echo',
      meta: {
        kind: 'event',
        eventDate: '2026-10-23T20:00:00Z',
        city: 'Los Angeles',
      },
    },
  },
};

/** A provider attached no metadata: eyebrow and title only, no stat strip. */
export const EmptyMetadata: Story = {
  args: {
    entity: { kind: 'track', id: 'track', label: 'Untitled Demo' },
  },
};

/** Some stats are missing and are skipped rather than shown as blanks. */
export const PartialReleaseMeta: Story = {
  args: {
    entity: {
      kind: 'release',
      id: 'release-partial',
      label: 'Sober Summer',
      meta: { kind: 'release', releaseDate: '2026-06-12' },
    },
  },
};

export const LongContent: Story = {
  args: {
    entity: {
      kind: 'artist',
      id: 'artist-long',
      label: 'The Extended Midnight Drive Sessions Orchestra And Friends',
      meta: {
        kind: 'artist',
        handle: 'extendedmidnightdrivesessionsorchestra',
        profileUrl: 'https://jov.ie/extendedmidnightdrivesessionsorchestra',
        followers: 1_284_000,
        popularity: 72,
        verified: true,
      },
    },
  },
};

export const RtlPreview: Story = {
  args: {
    entity: {
      kind: 'release',
      id: 'release-rtl',
      label: 'ليلة في القاهرة',
      meta: {
        kind: 'release',
        releaseType: 'album',
        totalTracks: 12,
        releaseDate: '2026-03-01',
      },
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
