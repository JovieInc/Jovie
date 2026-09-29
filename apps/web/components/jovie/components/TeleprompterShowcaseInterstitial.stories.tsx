import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TeleprompterShowcaseInterstitial } from './TeleprompterShowcaseInterstitial';

const meta = {
  title: 'Jovie/Components/TeleprompterShowcaseInterstitial',
  component: TeleprompterShowcaseInterstitial,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    open: true,
    onOpenChange: fn(),
    onStartRecording: fn(),
    profileId: 'profile-story',
    kind: 'promo',
    title: 'Release Promo',
    script:
      'Hey, it is me. My new single drops Friday — tap the link in my bio to pre-save it now.',
    showcaseVariant: 'interstitial',
  },
} satisfies Meta<typeof TeleprompterShowcaseInterstitial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};
