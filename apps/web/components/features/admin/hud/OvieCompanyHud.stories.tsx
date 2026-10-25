import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CompanyTile } from '@/lib/ovie/home/company-hud';
import { OvieCompanyHud } from './OvieCompanyHud';

const tiles: readonly CompanyTile[] = [
  {
    id: 'alive',
    label: 'Default Alive',
    value: 'Dead',
    line: '$22.96 cash · $110.00/mo burn · runway 0.2 months',
    tone: 'bad',
    measured: true,
    href: '/app/ov/costs',
    hrefLabel: 'Capacity',
    details: [
      'Revenue growth is not yet outpacing burn at the current trajectory.',
    ],
  },
  {
    id: 'revenue',
    label: 'MRR',
    value: '$0.00',
    line: 'no baseline week-over-week (MRR was $0) · 0 subscribers',
    tone: 'bad',
    measured: true,
    href: '/app/ov/ops',
    hrefLabel: 'Ops',
    details: ['Target: 5% or more a week.'],
  },
  {
    id: 'funnel',
    label: 'Funnel 7d',
    value: '3 → 0',
    line: 'Biggest leak: Onboarding chats to Accounts created (−2)',
    tone: 'warn',
    measured: true,
    href: '/app/ov/growth',
    hrefLabel: 'Growth',
    details: [
      'Onboarding chats: 3',
      'Accounts created: 1 (33% of previous)',
      'Weekly active users are not measured: no authoritative source yet.',
    ],
  },
  {
    id: 'shipping',
    label: 'Shipped Today',
    value: '96',
    line: 'merges · 12 verified in production · +25% vs prior 7d',
    tone: 'good',
    measured: true,
    href: '/app/ov/shipping',
    hrefLabel: 'Shipping',
    details: [],
  },
  {
    id: 'fleet',
    label: 'Fleet',
    value: 'Degraded',
    line: '3 of 4 lanes running · 0 production incidents in 24h',
    tone: 'warn',
    measured: true,
    href: '/app/ov/operations',
    hrefLabel: 'Fleet',
    details: [
      'Remediation alerts are not being acknowledged (57 failed delivery records)',
    ],
  },
  {
    id: 'blocked',
    label: 'Blocked On You',
    value: '9',
    line: 'next default in 2h',
    tone: 'warn',
    measured: true,
    href: '/app/ov/inbox',
    hrefLabel: 'Inbox',
    details: [],
  },
];

const meta = {
  title: 'Features/Admin/Hud/OvieCompanyHud',
  component: OvieCompanyHud,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='@container w-full max-w-6xl'>
        <Story />
      </div>
    ),
  ],
  args: {
    tiles,
    since: {
      ageLabel: '3h ago',
      lines: ['+3 signups (7d)', 'Fleet healthy to degraded'],
    },
  },
} satisfies Meta<typeof OvieCompanyHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { tiles: null, since: null } };
export const NothingChanged: Story = {
  args: { since: { ageLabel: '20m ago', lines: [] } },
};
export const NotMeasured: Story = {
  args: {
    since: null,
    tiles: tiles.map(t => ({
      ...t,
      value: 'Not measured',
      line: 'Source unavailable.',
      tone: 'neutral' as const,
      measured: false,
      details: [],
    })),
  },
};
