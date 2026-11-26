import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { TriageDeck } from './TriageDeck';

function suggestion(creatorId: string, reasons: string[]): ListMember {
  return {
    creatorId,
    state: 'suggested',
    rating: null,
    favorite: false,
    source: 'suggestion',
    addedAt: '2026-10-04T03:00:00.000Z',
    suggestionReasons: reasons,
  };
}

const CREATORS = new Map<string, ListCreator>([
  [
    'long',
    {
      id: 'long',
      username: 'a-creator-with-a-very-long-handle',
      displayName:
        'A creator with an extremely long display name that truncates',
      avatarUrl: null,
      genres: ['indie pop', 'bedroom pop', 'dream pop', 'shoegaze'],
    },
  ],
]);

const meta = {
  title: 'Features/Admin/Lists/TriageDeck/States',
  component: TriageDeck,
  parameters: { layout: 'padded' },
  args: {
    suggestions: [suggestion('long', ['Shares indie pop with 2 of 2 picks'])],
    creatorsById: CREATORS,
    busy: false,
    onDecide: fn(),
  },
} satisfies Meta<typeof TriageDeck>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no suggestions to decide on. */
export const EmptyNoSuggestions: Story = {
  args: { suggestions: [] },
};

/** Long content: long name, facts and many suggestion reasons. */
export const LongContentSuggestion: Story = {
  args: {
    suggestions: [
      suggestion('long', [
        'Shares indie pop with 2 of 2 picks',
        'Similar listener overlap with three creators already on this list',
        'Recently crossed a follower threshold that matches your rated picks',
      ]),
    ],
  },
};

/** Rtl: the deck in a right-to-left document. */
export const RtlDeck: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
