import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { BannerViewport } from './BannerViewport';
import { banner } from './banner-store';

const DEFAULT_TITLE = 'Scheduled maintenance tonight at 10pm PT';
const DEFAULT_DESCRIPTION =
  'Some dashboard features may be briefly unavailable.';

function SeededBannerViewport({
  variant,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  dir,
}: {
  readonly variant: 'success' | 'warning' | 'error' | 'info';
  readonly title?: string;
  readonly description?: string;
  readonly dir?: 'ltr' | 'rtl';
}) {
  useEffect(() => {
    const id = banner.show({
      id: 'story-banner',
      variant,
      title,
      description,
    });
    return () => banner.dismiss(id);
  }, [variant, title, description]);

  return (
    <div
      dir={dir}
      className='relative h-32 w-96 overflow-hidden rounded-lg border border-subtle bg-base'
    >
      <BannerViewport />
    </div>
  );
}

const meta = {
  title: 'Feedback/BannerViewport',
  component: SeededBannerViewport,
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'info',
  },
} satisfies Meta<typeof SeededBannerViewport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Warning: Story = {
  args: {
    variant: 'warning',
  },
};

export const ErrorState: Story = {
  args: {
    variant: 'error',
  },
};

export const LongContent: Story = {
  args: {
    variant: 'warning',
    title:
      'Scheduled maintenance tonight at 10pm PT across analytics, release smart links, audience exports and payouts',
    description:
      'Some dashboard features, including CSV exports, release scheduling and payout history, may be briefly unavailable for up to forty-five minutes while Jovie upgrades its infrastructure.',
  },
};

export const Rtl: Story = {
  args: {
    variant: 'info',
    dir: 'rtl',
    title: 'صيانة مجدولة الليلة الساعة العاشرة مساءً بتوقيت المحيط الهادئ',
    description: 'قد تكون بعض ميزات لوحة التحكم غير متاحة لفترة وجيزة.',
  },
};
