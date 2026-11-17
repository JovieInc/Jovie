import {
  ComboboxOptions,
  Combobox as HeadlessCombobox,
} from '@headlessui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ComboboxOptionItem } from './ComboboxOptionItem';
import type { ComboboxOption } from './types';

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for one artist suggestion row. The Default and Selected
 * stories stay in ComboboxOptionItem.stories.tsx; these change the option the
 * row shows and the document direction.
 */
const meta = {
  title: 'Organisms/Combobox/ComboboxOptionItem States',
  component: ComboboxOptionItem,
  parameters: { layout: 'centered' },
  args: {
    option: { id: 'first-artist', name: 'First Artist' },
    index: 0,
  },
  render: args => (
    <div className='w-80 bg-surface-0 p-4'>
      <HeadlessCombobox value={null} onChange={() => undefined}>
        <ComboboxOptions static aria-label='Artists' className='space-y-1'>
          <ComboboxOptionItem {...args} />
        </ComboboxOptions>
      </HeadlessCombobox>
    </div>
  ),
} satisfies Meta<typeof ComboboxOptionItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const brokenImageOption: ComboboxOption = {
  id: 'broken-image',
  name: 'Broken Image Artist',
  imageUrl: '/storybook-missing-artist-image.jpg',
};

/** Error: the artist image fails to load, so the row falls back to initials. */
export const ErrorImageFallback: Story = {
  args: { option: brokenImageOption },
};

/** Long content: a very long artist name truncates on one line. */
export const LongContentArtistName: Story = {
  args: {
    option: {
      id: 'long-name',
      name: 'The Extraordinarily Long Named Orchestra and Choir of the Northern Hemisphere',
    },
  },
};

/** Right-to-left: an Arabic artist name inside an RTL document. */
export const RtlDocument: Story = {
  args: { option: { id: 'rtl', name: 'عمرو دياب' } },
  decorators: [RtlFrame],
};
