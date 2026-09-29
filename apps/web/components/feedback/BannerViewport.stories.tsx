import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { BannerViewport } from './BannerViewport';
import { banner } from './banner-store';

function SeededBannerViewport({
  variant,
}: {
  readonly variant: 'success' | 'warning' | 'error' | 'info';
}) {
  useEffect(() => {
    const id = banner.show({
      id: 'story-banner',
      variant,
      title: 'Scheduled maintenance tonight at 10pm PT',
      description: 'Some dashboard features may be briefly unavailable.',
    });
    return () => banner.dismiss(id);
  }, [variant]);

  return (
    <div className='relative h-32 w-96 overflow-hidden rounded-lg border border-subtle bg-base'>
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
