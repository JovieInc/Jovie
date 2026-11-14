import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UnavailablePage } from './UnavailablePage';

const meta = {
  title: 'UnavailablePage',
  component: UnavailablePage,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof UnavailablePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The one face it draws: shown to blocked accounts in place of the app. */
export const ErrorUnavailable: Story = {};

/** The title wraps inside a 320px phone instead of overflowing. */
export const ErrorPhoneWidth: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
