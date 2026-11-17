import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { HostDrawnInput, HostDrawnSelect } from './host-drawn-field';

// The atoms draw nothing; these token shells stand in for the hosts that
// compose them in the app (a field shell, a chip label, a host stylesheet).
const SHELL =
  'flex w-72 items-center gap-3 rounded-full border border-subtle bg-surface-1 px-4 py-3 focus-within:border-focus';
const FIELD =
  'min-w-0 flex-1 bg-transparent text-sm text-primary-token placeholder:text-tertiary-token focus-visible:outline-none';
const CHIP =
  'grid h-8 cursor-pointer place-items-center rounded-full border border-subtle px-3 text-sm text-secondary-token';

const meta = {
  title: 'UI/Atoms/HostDrawnField',
  component: HostDrawnInput,
  parameters: { layout: 'centered' },
  render: args => (
    <div className={SHELL}>
      <HostDrawnInput {...args} className={FIELD} />
    </div>
  ),
  args: { 'aria-label': 'Artist name', placeholder: 'Search artist name' },
} satisfies Meta<typeof HostDrawnInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const PartialEntry: Story = {
  args: { defaultValue: 'Neon Har' },
};

export const LongContent: Story = {
  args: {
    defaultValue:
      'The Extraordinarily Long Name Of A Touring Collective That Keeps Going Well Past The Field Edge',
  },
};

function ChipRow({ dir }: { readonly dir?: 'rtl' }) {
  const [role, setRole] = useState('artist');
  const choices =
    dir === 'rtl'
      ? [
          ['artist', 'فنان'],
          ['manager', 'مدير أعمال الفنانين والفرق الموسيقية'],
        ]
      : [
          ['artist', 'Artist'],
          ['manager', 'Manager'],
        ];
  return (
    <fieldset dir={dir} className='flex gap-2 border-0 p-0'>
      <legend className='sr-only'>{dir === 'rtl' ? 'أنا' : 'I am a'}</legend>
      {choices.map(([value, label]) => (
        <label
          key={value}
          className={CHIP}
          data-selected={role === value ? 'true' : undefined}
        >
          <HostDrawnInput
            visuallyHidden
            type='radio'
            name={`role-${dir ?? 'ltr'}`}
            value={value}
            checked={role === value}
            onChange={() => setRole(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export const VisuallyHiddenChipRadio: Story = {
  render: () => <ChipRow />,
};

export const Rtl: Story = {
  render: () => (
    <div className='grid gap-4'>
      <div dir='rtl' className={SHELL}>
        <HostDrawnInput
          aria-label='اسم الفنان'
          defaultValue='اسم طويل جدا لفرقة موسيقية تتجاوز حافة الحقل'
          className={FIELD}
        />
      </div>
      <ChipRow dir='rtl' />
    </div>
  ),
};

export const HostStyledSelect: Story = {
  render: () => (
    <HostDrawnSelect
      aria-label='Select Plan To Compare'
      defaultValue='pro'
      className='h-11 w-72 rounded-lg border border-subtle bg-surface-0 px-4 text-sm text-primary-token'
    >
      <option value='free'>Free</option>
      <option value='pro'>Pro</option>
    </HostDrawnSelect>
  ),
};
