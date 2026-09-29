import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Search, X } from 'lucide-react';
import { fn } from 'storybook/test';
import { PageToolbarSearchForm } from './PageToolbarSearchForm';

const meta = {
  title: 'Organisms/Table/Molecules/PageToolbarSearchForm',
  component: PageToolbarSearchForm,
  parameters: {
    layout: 'centered',
  },
  args: {
    searchValue: '',
    onSearchValueChange: fn(),
    placeholder: 'Search releases...',
    ariaLabel: 'Search releases',
    submitAriaLabel: 'Search',
    submitIcon: <Search className='h-3.5 w-3.5' />,
    clearIcon: <X className='h-3.5 w-3.5' />,
  },
} satisfies Meta<typeof PageToolbarSearchForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    searchValue: 'midnight',
    clearHref: '?',
  },
};

export const Compact: Story = {
  args: {
    compact: true,
    tooltipLabel: 'Search',
  },
};
