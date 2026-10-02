import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChannelIcon, ContactGlyph } from './ContactIcons';

const meta = {
  title: 'Features/Profile/ContactIcons',
  component: ContactGlyph,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ContactGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Glyph: Story = {};

export const Channels: StoryObj<typeof ChannelIcon> = {
  render: () => (
    <div className='flex gap-3'>
      <ChannelIcon type='phone' />
      <ChannelIcon type='sms' />
      <ChannelIcon type='email' />
    </div>
  ),
};
