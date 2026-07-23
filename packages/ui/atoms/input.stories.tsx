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
  args: { placeholder: 'Search tracks', id: 'input-default' },
};

export const Disabled: Story = {
  args: { placeholder: 'Disabled', disabled: true, id: 'input-disabled' },
};

export const Loading: Story = {
  args: { placeholder: 'Loading…', loading: true, id: 'input-loading' },
};

export const Error: Story = {
  args: {
    placeholder: 'Invalid value',
    validationState: 'error',
    defaultValue: 'bad',
    id: 'input-error',
  },
};

export const LongContent: Story = {
  args: {
    defaultValue:
      'An extremely long value that should not overflow the narrow input container in visual tests',
    id: 'input-long',
  },
  decorators: [
    Story => (
      <div className='w-48'>
        <Story />
      </div>
    ),
  ],
};
