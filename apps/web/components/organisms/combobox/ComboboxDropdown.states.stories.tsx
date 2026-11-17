import { Combobox as HeadlessCombobox } from '@headlessui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { ComboboxDropdown } from './ComboboxDropdown';
import type { ComboboxOption } from './types';

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the artist suggestions dropdown. The canonical Loading
 * and NoResults stories stay in ComboboxDropdown.stories.tsx; these render the
 * same dropdown inside a headless combobox with other options and queries.
 */
const meta = {
  title: 'Organisms/Combobox/ComboboxDropdown States',
  component: ComboboxDropdown,
  parameters: { layout: 'centered' },
  args: {
    listboxId: 'artist-results-states',
    isOpen: true,
    isLoading: false,
    query: '',
    filteredOptions: [],
  },
  render: args => (
    <div className='relative h-72 w-96 bg-surface-0 p-4'>
      <HeadlessCombobox value={null} onChange={() => undefined}>
        <ComboboxDropdown {...args} />
      </HeadlessCombobox>
    </div>
  ),
} satisfies Meta<typeof ComboboxDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const manyOptions: ComboboxOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `artist-${i}`,
  name:
    i === 0
      ? 'The Extraordinarily Long Named Orchestra and Choir of the Northern Hemisphere'
      : `Artist ${i + 1}`,
}));

/** Empty: a finished search with no match shows guidance and a help link. */
export const EmptySearchResults: Story = {
  args: { query: 'zzqx' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('link', { name: 'Verify your Spotify artist profile' })
    ).toBeVisible();
  },
};

/** Long content: twelve suggestions scroll inside the capped panel and a long name truncates. */
export const LongContentManyArtists: Story = {
  args: { query: 'art', filteredOptions: manyOptions },
};

/** Right-to-left: suggestions inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    query: 'فن',
    filteredOptions: [
      { id: 'rtl-1', name: 'فيروز' },
      { id: 'rtl-2', name: 'عمرو دياب' },
    ],
  },
  decorators: [RtlFrame],
};
