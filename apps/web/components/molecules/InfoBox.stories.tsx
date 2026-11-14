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

export const PartialWithoutTitle: Story = {
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

export const InlineNotices: Story = {
  render: () => (
    <div className='w-96 space-y-4'>
      <InfoBox presentation='inline' variant='success'>
        Artist import complete.
      </InfoBox>
      <InfoBox presentation='inline' variant='warning'>
        Artist import is taking longer than expected.
      </InfoBox>
      <InfoBox presentation='inline' variant='error'>
        Artist import failed. Try again.
      </InfoBox>
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    title:
      'Your distributor has not confirmed the release date for every territory yet',
    variant: 'warning',
    children:
      'Spotify, Apple Music and YouTube Music confirmed Friday, but Tidal, Deezer, Amazon Music and Beatport are still processing the delivery. Smart links show the stores that are live and add the rest automatically as each one confirms the release.',
    className: 'w-96',
  },
};

export const Rtl: Story = {
  args: {
    title: 'معلومات',
    variant: 'info',
    children: 'هذه رسالة إعلامية لمساعدة المستخدم.',
    className: 'w-96',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
