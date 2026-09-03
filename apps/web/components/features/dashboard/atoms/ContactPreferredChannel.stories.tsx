import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ContactPreferredChannel } from './ContactPreferredChannel';

const meta = {
  title: 'Features/Dashboard/Atoms/ContactPreferredChannel',
  component: ContactPreferredChannel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 rounded-md border border-subtle bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    contactId: 'contact-story',
    preferredChannel: 'email',
    onChannelChange: fn(),
  },
} satisfies Meta<typeof ContactPreferredChannel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmailPreferred: Story = {};

export const PhonePreferred: Story = {
  args: {
    preferredChannel: 'phone',
  },
};

export const MissingPreferredChannel: Story = {
  args: {
    preferredChannel: null,
  },
};
