import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ProfileRedirectSurface } from './ProfileRedirectSurface';

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Profile/ProfileRedirectSurface',
  component: ProfileRedirectSurface,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    title: 'Opening your profile',
    description: 'Taking you to the latest version of this page.',
  },
} satisfies Meta<typeof ProfileRedirectSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The redirect hand-off with the default helper line. */
export const Default: Story = {};

/** Long content: a long title, description and helper line wrap in the card. */
export const LongContentCopy: Story = {
  args: {
    title:
      'Opening the latest profile for Tim White and the Midnight Orchestra of Los Angeles',
    description:
      'This handle moved to a new address. We are taking you to the current profile, its releases and every listening link the artist keeps up to date.',
    helperText:
      'This usually takes a moment. If nothing happens after a few seconds, refresh the page to try again.',
  },
};

/** RTL: Arabic copy in a right-to-left document. */
export const RtlArabic: Story = {
  args: {
    title: 'جارٍ فتح ملفك الشخصي',
    description: 'ننقلك إلى أحدث نسخة من هذه الصفحة.',
    helperText: 'يستغرق هذا عادةً لحظة.',
  },
  decorators: [withRtl],
};
