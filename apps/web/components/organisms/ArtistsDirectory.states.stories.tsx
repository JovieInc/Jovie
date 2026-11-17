import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import {
  ArtistsDirectory,
  type ArtistsDirectoryProfile,
} from './ArtistsDirectory';
import { ARTISTS_DIRECTORY_STORY_PROFILES } from './ArtistsDirectory.fixture';

/**
 * State coverage for the /artists directory body. These start from the
 * deterministic Tim White fixture and change only the profiles and paging the
 * route passes, or the document direction. No avatar URLs are invented.
 */
const meta = {
  title: 'Public Catalog/ArtistsDirectory States',
  component: ArtistsDirectory,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    profiles: ARTISTS_DIRECTORY_STORY_PROFILES,
  },
} satisfies Meta<typeof ArtistsDirectory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a profile with no display name, avatar or bio falls back to its handle. */
export const PartialHandleOnlyProfile: Story = {
  args: {
    profiles: [
      ...ARTISTS_DIRECTORY_STORY_PROFILES,
      {
        id: 'states-handle-only',
        username: 'handleonly',
        displayName: null,
        avatarUrl: null,
        bio: null,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'handleonly' })
    ).toBeVisible();
  },
};

const longProfiles: ArtistsDirectoryProfile[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: `states-long-${index + 1}`,
    username: `longartist${index + 1}`,
    displayName: `Artist ${index + 1} and the Very Long Band Name Collective`,
    avatarUrl: null,
    bio: 'A deliberately long bio that runs past three lines so the card clamps it cleanly instead of growing, while the grid keeps every card the same height across the row.',
  })
);

/** Long content: a full page of long names and bios with paging links. */
export const LongContentFullPage: Story = {
  args: {
    profiles: longProfiles,
    nextCursor: 'states-cursor',
    isFirstPage: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('heading', { level: 2 })).toHaveLength(12);
    await expect(
      canvas.getByRole('link', { name: 'Load more artists' })
    ).toBeVisible();
  },
};

/** Right-to-left: an Arabic profile inside an RTL document. */
export const RtlArabicProfile: Story = {
  args: {
    profiles: [
      {
        id: 'states-rtl',
        username: 'layla',
        displayName: 'ليلى حداد',
        avatarUrl: null,
        bio: 'منتجة موسيقى إلكترونية من بيروت',
      },
    ],
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
      canvas.getByRole('heading', { level: 2, name: 'ليلى حداد' })
    ).toBeVisible();
  },
};
