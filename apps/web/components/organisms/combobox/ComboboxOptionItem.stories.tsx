import {
  ComboboxOptions,
  Combobox as HeadlessCombobox,
} from '@headlessui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ComboboxOptionItem } from './ComboboxOptionItem';
import type { ComboboxOption } from './types';

const option: ComboboxOption = {
  id: 'first-artist',
  name: 'First Artist',
};

const meta: Meta<typeof ComboboxOptionItem> = {
  title: 'Organisms/Combobox/ComboboxOptionItem',
  component: ComboboxOptionItem,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ComboboxOptionItem>;

function OptionItemStory({
  selected = false,
}: {
  readonly selected?: boolean;
}) {
  return (
    <div className='w-80 bg-neutral-950 p-4'>
      <HeadlessCombobox
        value={selected ? option : null}
        onChange={() => undefined}
      >
        <ComboboxOptions static className='space-y-1'>
          <ComboboxOptionItem option={option} index={0} />
        </ComboboxOptions>
      </HeadlessCombobox>
    </div>
  );
}

export const Default: Story = {
  render: () => <OptionItemStory />,
};

export const Selected: Story = {
  render: () => <OptionItemStory selected />,
};
