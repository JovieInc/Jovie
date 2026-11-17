import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { CreatorSourcingRow } from './CreatorSourcingRow';

const ADDED_AT = '2026-10-04T03:00:00.000Z';

function NarrowList(Story: () => ReactNode) {
  return (
    <ul className='ov-mode w-full max-w-xl bg-base'>
      <Story />
    </ul>
  );
}

function RtlList(Story: () => ReactNode) {
  return (
    <ul dir='rtl' lang='ar' className='ov-mode w-full max-w-xl bg-base'>
      <Story />
    </ul>
  );
}

const meta = {
  title: 'Features/Admin/Lists/CreatorSourcingRow States',
  component: CreatorSourcingRow,
  parameters: { layout: 'padded' },
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

/** Long content: a long name, facts, context and reason share one line. */
export const LongContentSuggestedCreator: Story = {
  decorators: [NarrowList],
  args: {
    creator: {
      id: 'a',
      username: 'themidnightcollective',
      displayName:
        'The Midnight Collective Featuring The Northern Lights Orchestra',
      avatarUrl: null,
      isVerified: true,
      genres: ['progressive psychedelic shoegaze', 'ambient neoclassical'],
      spotifyFollowers: 2_400_000,
      location: 'Llanfairpwllgwyngyll, Wales',
    },
    meta: 'From Summer festival openers and late additions',
    member: {
      creatorId: 'a',
      state: 'suggested',
      rating: null,
      favorite: false,
      source: 'suggestion',
      addedAt: ADDED_AT,
      suggestionReasons: [
        'Shares progressive psychedelic shoegaze with 14 of 15 picks',
        'Based in the same region as most of the list',
      ],
    },
  },
};

/** RTL: an Arabic name and context mirror with the trailing controls. */
export const RtlArabicCreator: Story = {
  decorators: [RtlList],
  args: {
    creator: {
      id: 'a',
      username: 'layla',
      displayName: 'ليلى الحداد',
      avatarUrl: null,
      genres: ['indie pop'],
      spotifyFollowers: 25_000,
      location: 'بيروت',
    },
    meta: 'من قائمة الصيف',
  },
};
