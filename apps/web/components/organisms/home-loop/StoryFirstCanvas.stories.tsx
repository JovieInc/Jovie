import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  StoryFirstBottleneck,
  StoryFirstGlancePulse,
  StoryFirstStageBucket,
} from '@/lib/ovie/home/story-first';
import { StoryFirstCanvas } from './StoryFirstCanvas';

const clear: StoryFirstBottleneck = {
  tone: 'clear',
  eyebrow: 'Bottleneck',
  title: 'Nothing is blocking revenue',
  body: 'The cone is clear. Shipping stays the quiet pulse — act only when a stage heats up.',
  moving: {
    label: 'JOV-8017 · Sidebar geometry',
    href: null,
  },
  needs: null,
  since: null,
  detailsHref: null,
};

const blocked: StoryFirstBottleneck = {
  tone: 'bad',
  eyebrow: 'Bottleneck · CHECKOUT',
  title: 'Checkout is blocking revenue',
  body: 'Nobody can pay yet. Entitlement after payment is uncertified — the same words Summer will say in chat.',
  moving: {
    label: 'JOV-13192 · checkout cert',
    href: null,
  },
  needs: 'Certify payment path',
  since: 'Nov 18',
  detailsHref: '/app/ov/certifications',
};

const glance: readonly StoryFirstGlancePulse[] = [
  {
    key: 'shipping',
    label: 'Shipping · 7d',
    value: '14',
    delta: '+3',
    tone: 'good',
    measured: true,
    points: [11, 12, 13, 12, 14, 13, 14],
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
    points: [11.8, 12, 12.1, 12.2, 12.3, 12.35, 12.4],
    trend: 'up',
    href: '/app/ov/ops',
  },
  {
    key: 'users',
    label: 'Users',
    value: '248',
    delta: '+18',
    tone: 'good',
    measured: true,
    points: [210, 220, 228, 235, 240, 244, 248],
    trend: 'up',
    href: '/app/ov/growth',
  },
];

const stages: readonly StoryFirstStageBucket[] = [
  {
    stage: 'investigating',
    label: 'Investigating',
    count: 2,
    highlight: null,
  },
  {
    stage: 'building',
    label: 'Building',
    count: 5,
    highlight: {
      identifier: 'JOV-8017',
      title: 'Sidebar geometry',
      href: null,
    },
  },
  { stage: 'tested', label: 'Review', count: 3, highlight: null },
  { stage: 'merging', label: 'Merging', count: 1, highlight: null },
];

const meta = {
  title: 'Organisms/HomeLoop/StoryFirstCanvas',
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

export const Clear: Story = {
  args: {
    bottleneck: clear,
    glance,
    stages,
    inFlightHref: '/app/ov/shipping',
  },
};

export const Bottleneck: Story = {
  args: {
    bottleneck: blocked,
    glance: glance.map((pulse, index) =>
      index === 1
        ? { ...pulse, delta: 'flat', tone: 'warn', trend: 'flat' as const }
        : pulse
    ),
    stages: [
      {
        stage: 'investigating',
        label: 'Investigating',
        count: 3,
        highlight: {
          identifier: 'JOV-13192',
          title: 'Checkout cert',
          href: null,
        },
      },
      { stage: 'building', label: 'Building', count: 4, highlight: null },
      { stage: 'tested', label: 'Review', count: 2, highlight: null },
      { stage: 'merging', label: 'Merging', count: 1, highlight: null },
    ],
    inFlightHref: '/app/ov/shipping',
  },
};
