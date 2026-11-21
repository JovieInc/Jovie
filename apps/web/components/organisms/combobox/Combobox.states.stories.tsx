import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Combobox } from './Combobox';
import type { ComboboxOption } from './types';

const longOptions: ComboboxOption[] = [
  {
    id: 'long',
    name: 'An Extraordinarily Long Artist Name That Keeps Going Past The Edge Of The Field',
  },
];

function StateHarness({
  options,
  initial = null,
  error = null,
}: {
  readonly options: ComboboxOption[];
  readonly initial?: ComboboxOption | null;
  readonly error?: string | null;
}) {
  const [value, setValue] = useState<ComboboxOption | null>(initial);
  return (
    <div className='w-96 p-6'>
      <Combobox
        options={options}
        value={value}
        onChange={setValue}
        onInputChange={() => undefined}
        onSubmit={() => undefined}
        error={error}
      />
    </div>
  );
}

/** Combobox states that the base stories do not cover. */
const meta: Meta<typeof Combobox> = {
  title: 'Organisms/Combobox/Combobox/States',
  component: Combobox,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Combobox>;

/** Empty: no matching artists, so the call to action stays disabled. */
export const EmptyNoOptions: Story = {
  render: () => <StateHarness options={[]} />,
};

/** Error: the field shows its validation message. */
export const ErrorValidation: Story = {
  render: () => (
    <StateHarness options={[]} error='Pick an artist to continue' />
  ),
};

/** Long content: a selected artist name longer than the field. */
export const LongContentSelectedName: Story = {
  render: () => (
    <StateHarness options={longOptions} initial={longOptions[0]} />
  ),
};
