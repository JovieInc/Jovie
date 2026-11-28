import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FunnelTracker } from './FunnelTracker';

const meta = {
  title: 'Molecules/FunnelTracker',
  component: FunnelTracker,
} satisfies Meta<typeof FunnelTracker>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Certification: Story = {
  args: {
    view: {
      title: 'Golden Path',
      caption: 'Example certification receipt',
      bottleneckId: 'profile',
      stages: [
        {
          id: 'profile',
          label: 'Public profile',
          status: 'failed',
          detail: 'Production differs from the approved design.',
        },
        { id: 'claim', label: 'Claim', status: 'blocked' },
        { id: 'signup', label: 'Signup and sign-in', status: 'verified' },
        { id: 'checkout', label: 'Checkout', status: 'unknown' },
      ],
    },
  },
};

export const Conversion: Story = {
  args: {
    vertical: true,
    view: {
      title: 'Audience funnel',
      caption: 'Example capture ratio · Subscribers ÷ unique visitors',
      bottleneckId: null,
      stages: [
        { id: 'views', label: 'Profile views', status: 'measured', count: 120 },
        {
          id: 'visitors',
          label: 'Unique visitors',
          status: 'measured',
          count: 48,
        },
        {
          id: 'subscribers',
          label: 'Subscribers',
          status: 'measured',
          count: 12,
          rate: '25%',
        },
      ],
    },
  },
};

export const Loading: Story = {
  args: { ...Conversion.args, loading: true },
};

const unverified = {
  ...Certification.args.view,
  bottleneckId: null,
  stages: Certification.args.view.stages.map(({ id, label }) => ({
    id,
    label,
    status: 'unknown' as const,
  })),
};

export const Empty: Story = {
  args: {
    ...Conversion.args,
    view: {
      ...Conversion.args.view,
      caption: 'No activity in this reporting window',
      stages: Conversion.args.view.stages.map(({ id, label }) => ({
        id,
        label,
        count: 0,
        status: 'measured',
      })),
    },
  },
};

export const Error: Story = {
  args: {
    view: { ...unverified, caption: 'Certification evidence unavailable' },
  },
};

export const Partial: Story = {
  args: {
    view: {
      ...unverified,
      stages: [
        Certification.args.view.stages[0],
        { ...unverified.stages[1], status: 'stale' },
        { ...unverified.stages[2], status: 'skipped' },
        unverified.stages[3],
      ],
      bottleneckId: 'profile',
    },
  },
};

export const LongContent: Story = {
  args: {
    view: {
      ...Certification.args.view,
      stages: Certification.args.view.stages.map(stage => ({
        ...stage,
        label: `${stage.label} on the current production deployment`,
      })),
    },
  },
};

export const Offline: Story = {
  args: {
    view: {
      ...unverified,
      caption: 'Current build could not be checked while offline',
    },
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  args: {
    view: {
      title: 'مسار الاعتماد',
      bottleneckId: 'profile',
      stages: [
        { id: 'profile', label: 'الملف العام', status: 'failed' },
        { id: 'signup', label: 'التسجيل', status: 'verified' },
      ],
    },
  },
};
