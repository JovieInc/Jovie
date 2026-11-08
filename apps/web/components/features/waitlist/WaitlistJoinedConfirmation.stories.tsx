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
