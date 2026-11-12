import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OperatorBanner } from './OperatorBanner';

const meta = {
  title: 'Features/Admin/OperatorBanner',
  component: OperatorBanner,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof OperatorBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnvironmentIssues: Story = {
  args: {
    initialIssues: ['DATABASE_URL is not set', 'CLERK_SECRET_KEY is missing'],
  },
};

/** No issues reported: the banner stays out of the way and renders nothing. */
export const EmptyNoIssues: Story = {
  args: {
    initialIssues: [],
  },
};

/** Critical configuration errors, the state the banner exists to show. */
export const ErrorCriticalConfig: Story = {
  args: {
    initialIssues: [
      'STRIPE_SECRET_KEY is invalid',
      'DATABASE_URL failed to connect',
      'RESEND_API_KEY is missing',
    ],
  },
};

/** Long issue strings and a large overflow count stay on one truncated line. */
export const LongContentManyIssues: Story = {
  args: {
    initialIssues: [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY does not match the expected publishable key format for this deployment environment',
      'SPOTIFY_CLIENT_SECRET was rejected by the token endpoint while refreshing the catalog ingestion credentials',
      'STRIPE_WEBHOOK_SECRET is missing',
      'RESEND_API_KEY is missing',
      'UPSTASH_REDIS_REST_URL is not a valid URL',
      'SENTRY_DSN is malformed',
    ],
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const RtlIssues: Story = {
  args: {
    initialIssues: [
      'متغير قاعدة البيانات غير مضبوط في بيئة المعاينة الحالية',
      'مفتاح الدفع السري مفقود',
      'عنوان البريد الإلكتروني للإشعارات غير صالح',
    ],
  },
  render: args => (
    <div dir='rtl' lang='ar'>
      <OperatorBanner {...args} />
    </div>
  ),
};
