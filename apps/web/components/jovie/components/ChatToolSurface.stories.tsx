import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatToolSurface } from './ChatToolSurface';

const meta = {
  title: 'Jovie/ChatToolSurface',
  component: ChatToolSurface,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <p className='p-3 text-sm text-primary-token'>Confirm this action?</p>
    ),
  },
} satisfies Meta<typeof ChatToolSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Success: Story = {
  args: {
    tone: 'success',
  },
};

export const Cancelled: Story = {
  args: {
    tone: 'cancelled',
  },
};

export const Flat: Story = {
  args: {
    tone: 'flat',
  },
};

/** Long tool copy wraps inside the surface instead of widening the card. */
export const LongContent: Story = {
  args: {
    children: (
      <p className='p-3 text-sm text-primary-token'>
        Add
        https://open.spotify.com/artist/0abcdefghijklmnopqrstuvwxyz1234567890 to
        your profile and replace the existing Spotify link that points at your
        previous artist page from the 2019 project?
      </p>
    ),
  },
};

/** Right-to-left copy keeps the surface padding and tone on both edges. */
export const RtlContent: Story = {
  args: {
    tone: 'success',
    children: (
      <p dir='rtl' lang='ar' className='p-3 text-sm text-primary-token'>
        تمت إضافة رابط سبوتيفاي إلى ملفك الشخصي.
      </p>
    ),
  },
};
