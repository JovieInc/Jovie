import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseMomentDrawer } from './ReleaseMomentDrawer';

const moment = {
  slug: 'single-1',
  title: 'Midnight Drive',
  momentType: 'single',
  friday: '2026-12-04',
} as const;

const meta = {
  title: 'Jovie/ReleaseCalendar/ReleaseMomentDrawer',
  component: ReleaseMomentDrawer,
  parameters: { layout: 'fullscreen' },
  args: { moment, onClose: fn() },
} satisfies Meta<typeof ReleaseMomentDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no moment is selected, so the drawer stays closed. */
export const EmptyClosed: Story = { args: { moment: null } };

/** Long content: a long moment title wraps in the drawer header. */
export const LongContentTitle: Story = {
  args: {
    moment: {
      ...moment,
      title:
        'Midnight Drive (Extended Club Mix featuring a very long list of guest artists and remixers)',
    },
  },
};

/** Rtl: the drawer content mirrors in a right-to-left layout. */
export const RtlDrawer: Story = {
  args: { moment: { ...moment, title: 'قيادة منتصف الليل' } },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
