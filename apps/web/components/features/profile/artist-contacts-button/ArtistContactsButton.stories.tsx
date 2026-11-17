import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ArtistContactsButton } from './ArtistContactsButton';
import { BOOKING_CONTACT, PRESS_CONTACT } from './contact-state-fixtures';

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Profile/ArtistContactsButton',
  component: ArtistContactsButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    contacts: [BOOKING_CONTACT, PRESS_CONTACT],
    artistHandle: 'tim',
    artistName: 'Tim White',
  },
} satisfies Meta<typeof ArtistContactsButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop: the trigger links to the profile's contact mode. */
export const Default: Story = {};

/** RTL: the trigger in a right-to-left document. */
export const RtlTrigger: Story = {
  decorators: [withRtl],
};
