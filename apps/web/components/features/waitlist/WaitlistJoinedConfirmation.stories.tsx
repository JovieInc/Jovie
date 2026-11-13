import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistJoinedConfirmation } from './WaitlistJoinedConfirmation';

const meta = {
  title: 'Features/Waitlist/WaitlistJoinedConfirmation',
  component: WaitlistJoinedConfirmation,
  parameters: { layout: 'centered' },
  args: { email: 'maya@example.com' },
} satisfies Meta<typeof WaitlistJoinedConfirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithArtist: Story = { args: { artistName: 'Maya Vale' } };

export const LongEmail: Story = {
  args: {
    email: 'management.and.bookings.for.the.band@verylongdomainexample.com',
    artistName: 'The Midnight Orchestra of Lower Manhattan',
  },
};

/** The artist question was skipped, so only the email line shows. */
export const PartialBlankArtist: Story = { args: { artistName: '   ' } };

export const RtlLayout: Story = {
  args: {
    email: 'maya@example.com',
    artistName: 'مايا فيل',
  },
  render: args => (
    <div dir='rtl' className='w-80'>
      <WaitlistJoinedConfirmation {...args} />
    </div>
  ),
};
