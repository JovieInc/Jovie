import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Select } from './Select';

const options = [
  { value: 'pop', label: 'Pop' },
  { value: 'rb', label: 'R&B' },
  { value: 'edm', label: 'EDM' },
];

const meta: Meta<typeof Select> = {
  title: 'Atoms/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
    },
  },
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    options,
    label: 'Favorite genre',
    required: true,
    size: 'md',
  },
};

export const ErrorState: Story = {
  args: {
    options,
    error: 'Please select a genre',
    label: 'Genre',
  },
};

export const Disabled: Story = {
  args: {
    options,
    disabled: true,
    label: 'Genre (closed)',
  },
};
