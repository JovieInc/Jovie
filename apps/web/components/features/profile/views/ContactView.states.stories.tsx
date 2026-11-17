import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import {
  BOOKING_CONTACT,
  LONG_CONTACT,
  RTL_CONTACT,
} from '../artist-contacts-button/contact-state-fixtures';
import { ContactView } from './ContactView';

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Profile/ContactView States',
  component: ContactView,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    artistHandle: 'tim',
    contacts: [BOOKING_CONTACT],
  },
} satisfies Meta<typeof ContactView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a contact whose role, company, name and territories run long. */
export const LongContentContact: Story = {
  args: { contacts: [LONG_CONTACT, BOOKING_CONTACT] },
};

/** RTL: an Arabic contact in a right-to-left document. */
export const RtlContact: Story = {
  args: { contacts: [RTL_CONTACT] },
  decorators: [withRtl],
};
