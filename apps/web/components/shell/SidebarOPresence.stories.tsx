import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarOPresence } from './SidebarOPresence';

const meta = {
  title: 'Shell/SidebarOPresence',
  component: SidebarOPresence,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='group w-56 bg-sidebar text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarOPresence>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: the O alone. The status slot is laid out but invisible. */
export const Idle: Story = {};

/** The desktop updater is checking or downloading (after the 400 ms delay). */
export const Updating: Story = { args: { updating: true } };

/** The OV skin draws the same O in the OV variant. */
export const Ovie: Story = {
  args: { variant: 'ov', href: '/app/ov' },
};
