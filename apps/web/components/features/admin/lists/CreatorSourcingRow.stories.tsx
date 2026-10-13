import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { CreatorSourcingRow } from './CreatorSourcingRow';

const ADDED_AT = '2026-10-04T03:00:00.000Z';

const meta = {
  title: 'Features/Admin/Lists/CreatorSourcingRow',
  component: CreatorSourcingRow,
  parameters: { layout: 'padded' },
  decorators: [
    (Story: () => ReactNode) => (
      <ul className='ov-mode w-full bg-base'>
        <Story />
      </ul>
    ),
  ],
  args: {
    creator: {
      id: 'a',
      username: 'ava',
      displayName: 'Ava',
      avatarUrl: null,
      genres: ['indie pop', 'dream pop'],
      spotifyFollowers: 25_000,
      location: 'Los Angeles, CA',
    },
    member: {
      creatorId: 'a',
      state: 'member',
      rating: 4,
      favorite: true,
      source: 'manual',
      addedAt: ADDED_AT,
    },
    onRate: fn(),
    onFavorite: fn(),
    onRemove: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof CreatorSourcingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};

export const Suggested: Story = {
  args: {
    member: {
      creatorId: 'a',
      state: 'suggested',
      rating: null,
      favorite: false,
      source: 'suggestion',
      addedAt: ADDED_AT,
      suggestionReasons: ['Shares indie pop with 2 of 2 picks'],
    },
  },
};

export const MissingProfile: Story = { args: { creator: undefined } };
