import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  StoryFirstBottleneck,
  StoryFirstGlancePulse,
  StoryFirstStageBucket,
} from '@/lib/ovie/home/story-first';
import { StoryFirstCanvas } from './StoryFirstCanvas';

const glance: readonly StoryFirstGlancePulse[] = [
  {
    key: 'shipping',
    label: 'Shipping · 7D',
    value: '14',
    delta: '+3',
    tone: 'good',
    measured: true,
    points: [11, 14],
    trend: 'up',
    href: '/app/ov/shipping',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    value: '$12.4k',
    delta: 'alive',
    tone: 'good',
    measured: true,
    points: [12, 12.4],
    trend: 'up',
    href: '/app/ov/ops',
  },
  {
    key: 'users',
    label: 'Users',
    value: '248',
    delta: null,
    tone: 'good',
    measured: true,
    points: [248, 248],
    trend: 'flat',
    href: '/app/ov/growth',
  },
];

const emptyStages: readonly StoryFirstStageBucket[] = [
  { stage: 'investigating', label: 'Investigating', count: 0, highlight: null },
  { stage: 'building', label: 'Building', count: 0, highlight: null },
  { stage: 'tested', label: 'Review', count: 0, highlight: null },
  { stage: 'merging', label: 'Merging', count: 0, highlight: null },
];

const clear: StoryFirstBottleneck = {
  tone: 'clear',
  eyebrow: 'Bottleneck',
  title: 'Nothing is blocking revenue',
  body: 'The cone is clear.',
  moving: null,
  needs: null,
  since: null,
  detailsHref: null,
};

const meta = {
  title: 'Organisms/HomeLoop/StoryFirstCanvas States',
  component: StoryFirstCanvas,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-dvh bg-base p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StoryFirstCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingBoard: Story = {
  args: {
    bottleneck: { ...clear, tone: 'loading', title: 'Reading revenue…' },
    glance,
    stages: emptyStages,
    glanceLoading: true,
    stagesStatus: 'loading',
  },
};

export const EmptyClear: Story = {
  args: {
    bottleneck: clear,
    glance,
    stages: emptyStages,
    inFlightHref: '/app/ov/shipping',
  },
};

export const ErrorUnknown: Story = {
  args: {
    bottleneck: {
      tone: 'unknown',
      eyebrow: 'Bottleneck',
      title: 'Shipping status is unknown',
      body: 'Shipping data could not load.',
      moving: null,
      needs: null,
      since: null,
      detailsHref: '/app/ov/shipping',
    },
    glance: glance.map(pulse => ({
      ...pulse,
      measured: false,
      value: 'Not measured',
      delta: null,
      points: [],
    })),
    stages: emptyStages,
    stagesStatus: 'error',
  },
};

export const PartialGlance: Story = {
  args: {
    bottleneck: clear,
    glance: glance.map((pulse, index) =>
      index === 1
        ? {
            ...pulse,
            measured: false,
            value: 'Not measured',
            delta: null,
            points: [],
          }
        : pulse
    ),
    stages: emptyStages,
  },
};

export const LongContentStory: Story = {
  args: {
    bottleneck: {
      tone: 'bad',
      eyebrow: 'Bottleneck · Checkout',
      title: 'Checkout is blocking revenue across entitlement and first unlock',
      body: 'Nobody can pay yet. Entitlement after payment is uncertified, receipt delivery is unproven, and the first-session unlock path still fails the cone — the same words Summer will say in chat.',
      moving: {
        label:
          'JOV-13192 · Certify the checkout payment entitlement path end to end',
        href: null,
      },
      needs:
        'Certify the full payment path including entitlement after Stripe confirms the charge',
      since: 'Nov 18',
      detailsHref: '/app/ov/certifications',
    },
    glance,
    stages: [
      {
        stage: 'investigating',
        label: 'Investigating',
        count: 3,
        highlight: {
          identifier: 'JOV-13192',
          title: 'Certify the checkout payment entitlement path end to end',
          href: null,
        },
      },
      ...emptyStages.slice(1),
    ],
    inFlightHref: '/app/ov/shipping',
  },
};

export const OfflineSources: Story = {
  args: {
    bottleneck: {
      tone: 'unknown',
      eyebrow: 'Bottleneck',
      title: 'Company state is unreachable',
      body: 'Nothing could leave the browser.',
      moving: null,
      needs: null,
      since: null,
      detailsHref: null,
    },
    glance: glance.map(pulse => ({
      ...pulse,
      measured: false,
      value: 'Not measured',
      delta: null,
      points: [],
    })),
    stages: emptyStages,
  },
};

export const RtlOverflow: Story = {
  args: {
    bottleneck: {
      ...clear,
      title: 'لا شيء يعيق الإيرادات',
      body: 'المخروط واضح. الشحن يبقى نبضة هادئة.',
    },
    glance,
    stages: emptyStages,
  },
  decorators: [
    Story => (
      <div dir='rtl' className='min-h-dvh bg-base p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};
