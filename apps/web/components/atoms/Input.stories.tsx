import { Input } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof Input> = {
  // Mirror of packages/ui — prefer UI/Atoms/Input there (ONE_SYSTEM_DRIFT batch 2 delete)
  title: 'UI/Atoms/Input (app mirror — prefer package)',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
    },
    validationState: {
      control: 'radio',
      options: ['valid', 'invalid', 'pending', null],
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
    placeholder: 'Enter your email',
    label: 'Email',
    helpText: 'We will never share your email.',
    size: 'md',
  },
};

export const Validation: Story = {
  args: {
    label: 'Username',
    validationState: 'invalid',
    error: 'Username is already taken',
    statusIcon: <span aria-hidden='true'>⚠️</span>,
  },
};

export const Loading: Story = {
  args: {
    label: 'Search',
    loading: true,
    size: 'lg',
    placeholder: 'Searching…',
  },
};
