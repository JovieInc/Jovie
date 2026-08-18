import { Combobox as HeadlessCombobox } from '@headlessui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ComboboxDropdown } from './ComboboxDropdown';

const meta: Meta<typeof ComboboxDropdown> = {
  title: 'Organisms/Combobox/ComboboxDropdown',
  component: ComboboxDropdown,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ComboboxDropdown>;

export const Loading: Story = {
  render: () => (
    <div className='relative h-40 w-96 bg-neutral-950 p-4'>
      <HeadlessCombobox value={null} onChange={() => undefined}>
        <ComboboxDropdown
          listboxId='loading-results'
          isOpen
          isLoading
          query='first'
          filteredOptions={[]}
        />
      </HeadlessCombobox>
    </div>
  ),
};

export const NoResults: Story = {
  render: () => (
    <div className='relative h-48 w-96 bg-neutral-950 p-4'>
      <HeadlessCombobox value={null} onChange={() => undefined}>
        <ComboboxDropdown
          listboxId='empty-results'
          isOpen
          isLoading={false}
          query='missing'
          filteredOptions={[]}
        />
      </HeadlessCombobox>
    </div>
  ),
};
