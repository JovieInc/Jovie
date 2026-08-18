import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';

const meta: Meta<typeof Input> = {
  title: 'UI/Atoms/Input',
  component: Input,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Search',
    placeholder: 'Search tracks',
    helpText: 'Search by track, artist, or album.',
    id: 'input-default',
  },
};

export const Disabled: Story = {
  args: { placeholder: 'Disabled', disabled: true, id: 'input-disabled' },
};

export const Loading: Story = {
  args: { placeholder: 'Loading…', loading: true, id: 'input-loading' },
};

export const Error: Story = {
  args: {
    label: 'Artist URL',
    placeholder: 'Invalid value',
    validationState: 'invalid',
    error: 'Enter a valid artist URL.',
    defaultValue: 'bad',
    id: 'input-error',
  },
};

export const Success: Story = {
  args: {
    label: 'Artist URL',
    validationState: 'valid',
    defaultValue: 'https://jov.ie/artist',
    helpText: 'This URL is available.',
    id: 'input-success',
  },
};

export const Pending: Story = {
  args: {
    label: 'Artist URL',
    validationState: 'pending',
    defaultValue: 'https://jov.ie/artist',
    helpText: 'Checking availability…',
    id: 'input-pending',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className='grid w-80 gap-4'>
      <Input
        id='input-small'
        inputSize='sm'
        label='Small'
        placeholder='Value'
      />
      <Input id='input-medium' label='Medium' placeholder='Value' />
      <Input
        id='input-large'
        inputSize='lg'
        label='Large'
        placeholder='Value'
      />
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    defaultValue:
      'An extremely long value that should not overflow the narrow input container in visual tests',
    id: 'input-long',
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};
