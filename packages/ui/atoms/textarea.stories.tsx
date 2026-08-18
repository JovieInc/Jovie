import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Atoms/Textarea',
  component: Textarea,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Release notes',
    placeholder: 'Tell fans about your release…',
    helpText: 'Keep it concise and specific.',
    id: 'ta-default',
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Read only', id: 'ta-disabled' },
};

export const Error: Story = {
  args: {
    label: 'Release notes',
    validationState: 'invalid',
    defaultValue: 'Too short',
    helpText: 'Describe what listeners should know.',
    error: 'Use at least 20 characters.',
    id: 'ta-error',
  },
};

export const Success: Story = {
  args: {
    label: 'Release notes',
    validationState: 'valid',
    defaultValue: 'A stripped-back version recorded live in Los Angeles.',
    helpText: 'Ready to publish.',
    id: 'ta-success',
  },
};

export const Pending: Story = {
  args: {
    label: 'Release notes',
    validationState: 'pending',
    defaultValue: 'A stripped-back version recorded live in Los Angeles.',
    helpText: 'Checking copy…',
    id: 'ta-pending',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className='grid w-80 gap-4'>
      <Textarea id='ta-small' textareaSize='sm' label='Small' />
      <Textarea id='ta-medium' label='Medium' />
      <Textarea id='ta-large' textareaSize='lg' label='Large' />
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    id: 'ta-long',
    defaultValue: Array.from(
      { length: 8 },
      (_, i) => `Line ${i + 1} of bio content.`
    ).join('\n'),
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};
