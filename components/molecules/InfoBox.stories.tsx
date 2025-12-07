import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InfoBox } from './InfoBox';

const meta: Meta<typeof InfoBox> = {
  title: 'Molecules/InfoBox',
  component: InfoBox,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'warning', 'success', 'error'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof InfoBox>;

export const Info: Story = {
  args: {
    title: 'Information',
    variant: 'info',
    children: 'This is an informational message to help guide the user.',
    className: 'w-96',
  },
};

export const Warning: Story = {
  args: {
    title: 'Warning',
    variant: 'warning',
    children: 'Please review this information before proceeding.',
    className: 'w-96',
  },
};

export const Success: Story = {
  args: {
    title: 'Success',
    variant: 'success',
    children: 'Your changes have been saved successfully.',
    className: 'w-96',
  },
};

export const Error: Story = {
  args: {
    title: 'Error',
    variant: 'error',
    children: 'Something went wrong. Please try again.',
    className: 'w-96',
  },
};

export const WithoutTitle: Story = {
  args: {
    variant: 'info',
    children: 'This info box has no title, just content.',
    className: 'w-96',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='space-y-4 w-96'>
      <InfoBox title='Information' variant='info'>
        This is an informational message.
      </InfoBox>
      <InfoBox title='Warning' variant='warning'>
        Please review before proceeding.
      </InfoBox>
      <InfoBox title='Success' variant='success'>
        Operation completed successfully.
      </InfoBox>
      <InfoBox title='Error' variant='error'>
        An error occurred. Please try again.
      </InfoBox>
    </div>
  ),
};
