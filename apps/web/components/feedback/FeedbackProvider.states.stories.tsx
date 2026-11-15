import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { banner } from './banner-store';
import { FeedbackProvider } from './FeedbackProvider';
import { toast } from './toast';

/**
 * Rendered feedback states. Each story queues one toast or banner through the
 * canonical `toast` / `banner` APIs when it mounts and clears it on unmount,
 * so the provider's own Toaster and BannerViewport draw it.
 */
function Queue({
  fire,
  children,
}: {
  readonly fire: () => void;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    fire();
    return () => {
      toast.dismiss();
      banner.dismiss();
    };
  }, [fire]);
  return <>{children}</>;
}

function PageContent({ text = 'Page content' }: { readonly text?: string }) {
  return (
    <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
      {text}
    </p>
  );
}

const meta = {
  title: 'Feedback/FeedbackProvider States',
  component: FeedbackProvider,
  parameters: { layout: 'centered' },
  args: { children: <PageContent /> },
} satisfies Meta<typeof FeedbackProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

const fireLoading = () => {
  toast.loading('Importing your catalog…', { duration: Infinity });
};
const fireError = () => {
  toast.error('Could not save the release. Try again.', { duration: Infinity });
};
const fireLong = () => {
  toast.info(
    'Your release plan, artwork, credits and every listen link are being checked against each service before release day.',
    {
      description:
        'This can take a few minutes for a large catalog. You can keep working; the plan updates in place as each service answers, and nothing is sent until you approve it.',
      duration: Infinity,
    }
  );
};
const fireOffline = () => {
  banner.warning('You are offline', {
    description:
      'Changes are saved on this device and sync when you reconnect.',
  });
};
const fireRtl = () => {
  toast.success('تم حفظ التغييرات', { duration: Infinity });
};

/** Loading: a persistent loading toast while a long job runs. */
export const LoadingImportToast: Story = {
  args: {
    children: (
      <Queue fire={fireLoading}>
        <PageContent />
      </Queue>
    ),
  },
};

/** Empty: nothing queued, so only the page content renders. */
export const EmptyNothingQueued: Story = {};

/** Error: an error toast after a failed save. */
export const ErrorSaveFailedToast: Story = {
  args: {
    children: (
      <Queue fire={fireError}>
        <PageContent />
      </Queue>
    ),
  },
};

/** Long content: a toast whose title and description both wrap. */
export const LongContentToast: Story = {
  args: {
    children: (
      <Queue fire={fireLong}>
        <PageContent />
      </Queue>
    ),
  },
};

/** Offline: a persistent top banner while the connection is down. */
export const OfflineBanner: Story = {
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <Queue fire={fireOffline}>
        <PageContent />
      </Queue>
    ),
  },
};

/**
 * Right-to-left: Arabic page content and toast copy. The toaster itself
 * stays left-to-right by design (Jovie ships left-to-right chrome).
 */
export const RtlArabicToast: Story = {
  args: {
    children: (
      <Queue fire={fireRtl}>
        <div dir='rtl' lang='ar'>
          <PageContent text='محتوى الصفحة' />
        </div>
      </Queue>
    ),
  },
};
