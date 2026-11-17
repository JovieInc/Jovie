import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HudFullscreenControl } from './HudFullscreenControl';

const meta = {
  title: 'Features/Admin/Hud/HudFullscreenControl States',
  component: HudFullscreenControl,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudFullscreenControl>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlControls() {
  return (
    <div dir='rtl' lang='ar' className='flex items-center gap-2'>
      <HudFullscreenControl />
      <HudFullscreenControl action='close' />
    </div>
  );
}

/** RTL: both controls keep their icon and label order mirrored. */
export const RtlControlsMirrored: Story = { render: RtlControls };
