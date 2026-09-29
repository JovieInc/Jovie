import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TableSearchBar } from './TableSearchBar';

const meta = {
  title: 'Organisms/Table/Molecules/TableSearchBar',
  component: TableSearchBar,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: '',
    onChange: fn(),
  },
} satisfies Meta<typeof TableSearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    value: 'midnight',
  },
};

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'Search releases...',
  },
};
