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
  args: { placeholder: 'Tell fans about your release…', id: 'ta-default' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Read only', id: 'ta-disabled' },
};

export const Error: Story = {
  args: {
    validationState: 'error',
    defaultValue: 'Too short',
    id: 'ta-error',
  },
};

export const LongContent: Story = {
  args: {
    id: 'ta-long',
    defaultValue: Array.from({ length: 8 }, (_, i) => `Line ${i + 1} of bio content.`).join(
      '\n'
    ),
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};
