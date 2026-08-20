import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Combobox } from './Combobox';
import type { ComboboxOption } from './types';

const options: ComboboxOption[] = [
  { id: 'one', name: 'First Artist' },
  { id: 'two', name: 'Second Artist' },
];

const meta: Meta<typeof Combobox> = {
  title: 'Organisms/Combobox/Combobox',
  component: Combobox,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Combobox>;

function InteractiveCombobox({
  disabled = false,
  isLoading = false,
}: {
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [value, setValue] = useState<ComboboxOption | null>(null);
  return (
    <div className='w-96 bg-neutral-950 p-6'>
      <Combobox
        options={options}
        value={value}
        onChange={setValue}
        onInputChange={() => undefined}
        disabled={disabled}
        isLoading={isLoading}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <InteractiveCombobox />,
};

export const Loading: Story = {
  render: () => <InteractiveCombobox isLoading />,
};

export const Disabled: Story = {
  render: () => <InteractiveCombobox disabled />,
};
