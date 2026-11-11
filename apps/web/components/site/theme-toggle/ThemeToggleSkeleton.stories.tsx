import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThemeToggleSkeleton } from './ThemeToggleSkeleton';

const meta = {
  title: 'Site/ThemeToggle/ThemeToggleSkeleton',
  component: ThemeToggleSkeleton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Hydration placeholder that reserves the icon or segmented theme control geometry without introducing a layout shift.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeToggleSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Icon: Story = {
  args: {
    appearance: 'icon',
  },
};

export const Segmented: Story = {
  args: {
    appearance: 'segmented',
  },
};

/**
 * Loading: the whole component is the pre-hydration placeholder. This is the
 * footer size, which reserves the 44px root target the live toggle keeps.
 */
export const LoadingFooterSegmented: Story = {
  args: {
    appearance: 'segmented',
    size: 'footer',
  },
};

/** Right-to-left: the reserved segments inside an RTL footer row. */
export const RtlSegmented: Story = {
  args: {
    appearance: 'segmented',
    size: 'footer',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
