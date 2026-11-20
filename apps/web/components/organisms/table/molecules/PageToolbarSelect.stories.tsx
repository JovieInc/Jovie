import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import {
  PageToolbarSelect,
  type PageToolbarSelectOption,
} from './PageToolbarSelect';

const OPTIONS = [
  { value: 'all', label: 'All People', menuLabel: 'All People (1,204)' },
  { value: 'identified', label: 'Identified', menuLabel: 'Identified (312)' },
  { value: 'anonymous', label: 'Anonymous', menuLabel: 'Anonymous (892)' },
] as const satisfies readonly PageToolbarSelectOption<
  'all' | 'identified' | 'anonymous'
>[];

function IdentitySelect({
  initial,
  defaultValue,
}: Readonly<{
  initial: 'all' | 'identified' | 'anonymous';
  defaultValue?: 'all';
}>) {
  const [value, setValue] = useState(initial);
  return (
    <PageToolbarSelect
      label='Identity'
      value={value}
      defaultValue={defaultValue}
      options={OPTIONS}
      onValueChange={setValue}
    />
  );
}

const meta = {
  title: 'Organisms/Table/PageToolbarSelect',
  component: PageToolbarSelect,
  parameters: { layout: 'padded' },
  args: {
    label: 'Identity',
    value: 'all',
    options: OPTIONS,
    onValueChange: () => undefined,
  },
} satisfies Meta<typeof PageToolbarSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPeople: Story = {
  render: () => <IdentitySelect initial='all' defaultValue='all' />,
};

export const Filtered: Story = {
  args: { value: 'identified', defaultValue: 'all' },
  render: () => <IdentitySelect initial='identified' defaultValue='all' />,
};
