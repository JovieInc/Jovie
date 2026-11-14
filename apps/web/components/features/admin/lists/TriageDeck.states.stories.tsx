import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
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

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

const CREATORS = new Map<string, ListCreator>([
  [
    'long',
    {
      id: 'long',
      username: 'aurelia-montgomery-fitzgerald-official',
      displayName: LONG_NAME,
      avatarUrl: null,
      genres: ['indie pop', 'chamber pop', 'neo-classical', 'dream pop'],
      spotifyFollowers: 12_500_000,
    },
  ],
  [
    'rtl',
    {
      id: 'rtl',
      username: 'layla',
      displayName: 'ليلى الحسن',
      avatarUrl: null,
      genres: ['بوب عربي'],
    },
  ],
]);

/** State coverage for the triage deck: nothing left, long copy, and RTL. */
const meta = {
  title: 'Features/Admin/Lists/TriageDeck States',
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

/** Empty: no suggestions to decide, so the deck says what to do next. */
export const EmptyNoSuggestions: Story = {
  args: { suggestions: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/All suggestions decided/)).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Long content: a long name truncates and several reasons stack. */
export const LongContentCreator: Story = {
  args: {
    suggestions: [
      suggestion('long', [
        'Shares indie pop, chamber pop and dream pop with 9 of 10 picks on this list',
        'Released a single in the last 30 days with a label you already favorited',
        'Followed by three creators you rated five stars',
      ]),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: LONG_NAME })
    ).toBeVisible();
    await expect(
      within(
        canvas.getByRole('list', { name: 'Why Jovie Suggested This Creator' })
      ).getAllByRole('listitem')
    ).toHaveLength(3);
  },
};

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Right-to-left: the card and its actions inside an RTL document. */
export const RtlSuggestion: Story = {
  args: {
    suggestions: [suggestion('rtl', ['يشارك البوب العربي مع اختياراتك'])],
  },
  decorators: [RtlDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'ليلى الحسن' })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add' })).toBeEnabled();
  },
};
