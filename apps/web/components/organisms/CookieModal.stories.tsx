import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CookieModal } from './CookieModal';

const meta: Meta<typeof CookieModal> = {
  title: 'Organisms/CookieModal',
  component: CookieModal,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // Internal category metadata owns the disabled Essential switch; it is
      // not a CookieModal prop that Storybook can control.
      uncoveredProps: ['disabled'],
    },
    chromatic: {
      viewports: [390, 1024],
    },
  },
  args: {
    open: true,
    onClose: fn(),
    onSave: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Preferences: Story = {};
