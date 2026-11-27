import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WrappedSocialLink } from './WrappedSocialLink';

const meta = {
  title: 'Molecules/WrappedSocialLink/States',
  component: WrappedSocialLink,
  parameters: { layout: 'centered' },
  decorators: [
    function WrapFrame(Story) {
      return (
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  args: { href: 'https://instagram.com/jovie', platform: 'instagram' },
} satisfies Meta<typeof WrappedSocialLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the link renders its safe label while the wrap request runs. */
export const LoadingWrapRequest: Story = {};

/** Error: when wrapping fails the link falls back to the original URL. */
export const ErrorFallsBackToHref: Story = {
  args: { href: 'https://example.invalid/profile', platform: 'website' },
};

/** Partial: an internal link skips wrapping and keeps custom children. */
export const PartialInternalLink: Story = {
  args: { href: '/listen', platform: 'website', children: 'Listen now' },
};

/** Long content: a long href still shows a short crawler-safe label. */
export const LongContentHref: Story = {
  args: {
    href: 'https://example.com/a/very/long/path/with/many/segments/and/a/query?utm_source=newsletter&utm_campaign=release-day',
    platform: 'website',
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-48'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the icon and label mirror in a right-to-left layout. */
export const RtlLink: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
