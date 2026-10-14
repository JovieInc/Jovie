import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { TriageDeck } from './TriageDeck';

function suggestion(creatorId: string): ListMember {
  return {
    creatorId,
    state: 'suggested',
    rating: null,
    favorite: false,
    source: 'suggestion',
    addedAt: '2026-10-04T03:00:00.000Z',
    suggestionReasons: ['Shares indie pop with 2 of 2 picks'],
  };
}

const CREATORS = new Map<string, ListCreator>([
  [
    'a',
    {
      id: 'a',
      username: 'ava',
      displayName: 'Ava',
      avatarUrl: null,
      genres: ['indie pop'],
      spotifyFollowers: 25_000,
    },
  ],
  ['b', { id: 'b', username: 'bo', displayName: 'Bo', avatarUrl: null }],
]);

const meta = {
  title: 'Features/Admin/Lists/TriageDeck',
  component: TriageDeck,
  parameters: { layout: 'padded' },
  args: {
    suggestions: [suggestion('a'), suggestion('b')],
    creatorsById: CREATORS,
    busy: false,
    onDecide: fn(),
  },
} satisfies Meta<typeof TriageDeck>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstSuggestion: Story = {};

export const Busy: Story = { args: { busy: true } };

export const AllDecided: Story = { args: { suggestions: [] } };
