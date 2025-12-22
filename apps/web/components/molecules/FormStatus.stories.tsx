import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FormStatus } from './FormStatus';

const meta: Meta<typeof FormStatus> = {
  title: 'Molecules/FormStatus',
  component: FormStatus,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof FormStatus>;

export const Loading: Story = {
  args: {
    loading: true,
    className: 'w-80',
  },
};

export const Error: Story = {
  args: {
    error: 'Something went wrong. Please try again.',
    className: 'w-80',
  },
};

export const Success: Story = {
  args: {
    success: 'Your changes have been saved successfully.',
    className: 'w-80',
  },
};

export const LoadingWithError: Story = {
  args: {
    loading: true,
    error: 'Previous attempt failed.',
    className: 'w-80',
  },
};

export const Empty: Story = {
  args: {
    // No loading, error, or success - should render nothing
    className: 'w-80',
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='space-y-6 w-80'>
      <div>
        <p className='text-sm font-medium mb-2'>Loading State:</p>
        <FormStatus loading />
      </div>
      <div>
        <p className='text-sm font-medium mb-2'>Error State:</p>
        <FormStatus error='Failed to save changes.' />
      </div>
      <div>
        <p className='text-sm font-medium mb-2'>Success State:</p>
        <FormStatus success='Profile updated successfully!' />
      </div>
    </div>
  ),
};
