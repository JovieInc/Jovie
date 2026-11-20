import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CookieActions } from './CookieActions';

const meta: Meta<typeof CookieActions> = {
  title: 'Molecules/CookieActions',
  component: CookieActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    onAcceptAll: fn(),
    onRejectAll: fn(),
    onCustomize: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {
  args: {
    compact: true,
  },
};

export const Standard: Story = {};

export const Disabled: Story = {
  args: {
    compact: true,
    disabled: true,
  },
};

/**
 * The consent banner in a right-to-left document: the three actions follow
 * the reading direction, so Reject all sits at the inline start (right).
 */
export const Rtl: Story = {
  args: {
    compact: true,
  },
  decorators: [
    Story => (
      <div dir='rtl' className='w-80'>
        <Story />
      </div>
    ),
  ],
};
