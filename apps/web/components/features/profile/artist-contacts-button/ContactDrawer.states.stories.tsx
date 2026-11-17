import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ContactDrawer } from './ContactDrawer';
import {
  BOOKING_CONTACT,
  firstChannel,
  LONG_CONTACT,
  RTL_CONTACT,
} from './contact-state-fixtures';

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Profile/ContactDrawer States',
  component: ContactDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onOpenChange: () => {},
    artistName: 'Tim White',
    artistHandle: 'tim',
    contacts: [BOOKING_CONTACT],
    primaryChannel: firstChannel,
  },
} satisfies Meta<typeof ContactDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long artist name in the title and a long contact. */
export const LongContentContacts: Story = {
  args: {
    artistName: 'Tim White and the Midnight Orchestra of Los Angeles',
    contacts: [LONG_CONTACT, BOOKING_CONTACT],
  },
};

/** RTL: an Arabic artist name and contact in a right-to-left document. */
export const RtlContacts: Story = {
  args: {
    artistName: 'تيم وايت',
    contacts: [RTL_CONTACT],
  },
  decorators: [withRtl],
};
