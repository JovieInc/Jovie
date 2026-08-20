import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NativeSelect } from './native-select';

const options = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
  { value: 'archived', label: 'Archived', disabled: true },
];

const meta: Meta<typeof NativeSelect> = {
  title: 'UI/Atoms/NativeSelect',
  component: NativeSelect,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { options, label: 'Release status', name: 'status' },
};

export const Required: Story = {
  args: { options, label: 'Release status', required: true, name: 'status' },
};

export const Error: Story = {
  args: {
    options,
    label: 'Release status',
    error: 'Choose a status',
    name: 'status',
  },
};

export const Disabled: Story = {
  args: { options, label: 'Release status', disabled: true, name: 'status' },
};
