import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Select } from './Select';

const options = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
  { value: 'archived', label: 'Archived', disabled: true },
];

const meta = {
  title: 'Atoms/Select',
  component: Select,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: { options, label: 'Release status', name: 'status' },
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Required: Story = {
  args: { required: true },
};

export const Error: Story = {
  args: { error: 'Choose a status' },
};

export const Disabled: Story = {
  args: { disabled: true },
};
