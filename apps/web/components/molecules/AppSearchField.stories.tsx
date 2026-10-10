import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { fn } from 'storybook/test';
import { AppSearchField, type AppSearchFieldProps } from './AppSearchField';

function SearchFieldStory(args: AppSearchFieldProps) {
  const [value, setValue] = useState(args.value);
  useEffect(() => setValue(args.value), [args.value]);
  return (
    <div className='w-full max-w-2xl p-4'>
      <AppSearchField
        {...args}
        value={value}
        onChange={nextValue => {
          setValue(nextValue);
          args.onChange(nextValue);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Molecules/AppSearchField',
  component: AppSearchField,
  parameters: { layout: 'fullscreen' },
  args: {
    value: '',
    onChange: fn(),
    ariaLabel: 'Search library',
  },
  render: args => <SearchFieldStory {...args} />,
} satisfies Meta<typeof AppSearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
  args: { value: 'Release planning and artwork' },
};

export const FilledLight: Story = {
  ...Filled,
  parameters: { themes: { themeOverride: 'light' } },
};

export const WithoutClear: Story = {
  args: { value: 'Release planning and artwork', showClearButton: false },
};
