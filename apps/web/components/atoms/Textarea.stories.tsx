import { Textarea } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof Textarea> = {
  title: 'Atoms/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Tell us about your music',
    placeholder: 'Add a short bio…',
    rows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Description',
    placeholder: 'Currently unavailable',
    disabled: true,
  },
};

export const ErrorState: Story = {
  args: {
    label: 'Notes',
    error: 'Please add at least 10 characters',
    rows: 3,
  },
};
