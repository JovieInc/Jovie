import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ShippingVelocityResponse } from '@/app/api/admin/hud/shipping-velocity/route';
import type { FounderFunnelData } from '@/lib/admin/types';
import {
  FounderConversionHud,
  FounderConversionHudSkeleton,
} from './FounderConversionHud';

const VELOCITY_KEY = ['hud', 'kpi', 'shipping-velocity', '30d'];

const funnel: FounderFunnelData = {
  timeRange: '30d',
  biggestDropOffKey: 'accounts_created',
  errors: [],
  definitionVersion: 'founder-funnel.v2',
  stages: [
    {
      key: 'onboarding_chats',
      label: 'Onboarding chats',
      description: 'Started onboarding',
      count: 100,
      conversionRate: null,
      dropOff: null,
      identifiable: false,
      drillDownHref: null,
    },
    {
      key: 'accounts_created',
      label: 'Accounts created',
      description: 'Created an account',
      count: 40,
      conversionRate: 0.4,
      dropOff: 60,
      identifiable: true,
      drillDownHref: '/app/ov/growth?view=leads&funnelStage=accounts_created',
    },
  ],
};

const emptyFunnel: FounderFunnelData = {
  ...funnel,
  biggestDropOffKey: null,
  stages: [],
};

const velocity: ShippingVelocityResponse = {
  data: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-0${index + 1}`,
    merged: index + 2,
    opened: index + 3,
    closed: 0,
  })),
  range: '30d',
  cachedAt: '2026-10-08T12:00:00Z',
  observation: 'fresh',
};

function withClient(data: ShippingVelocityResponse | null) {
  function QueryDecorator({ children }: { children: ReactNode }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (data) client.setQueryData(VELOCITY_KEY, data);
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return function Decorator(Story: () => ReactNode) {
    return (
      <QueryDecorator>
        <Story />
      </QueryDecorator>
    );
  };
}

const meta = {
  title: 'Admin/HUD/FounderConversionHud',
  component: FounderConversionHud,
  parameters: { layout: 'padded' },
  args: { mrrUsd: 5200, initialFunnel: funnel },
  decorators: [withClient(velocity)],
} satisfies Meta<typeof FounderConversionHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Loading: the skeleton shown before the HUD data resolves. */
export const Loading: Story = {
  render: () => <FounderConversionHudSkeleton />,
};

/** Empty: no MRR and no funnel stages yet. */
export const Empty: Story = {
  args: { mrrUsd: null, initialFunnel: emptyFunnel },
  decorators: [withClient(null)],
};

/** Offline: velocity cannot be fetched, so it falls back to a dash. */
export const Offline: Story = {
  decorators: [withClient(null)],
};

/** Long content: a large MRR and a very long stage label. */
export const LongContent: Story = {
  args: {
    mrrUsd: 123456789,
    initialFunnel: {
      ...funnel,
      stages: funnel.stages.map(stage => ({
        ...stage,
        label: `${stage.label} for every artist who joined through a long partner campaign`,
      })),
    },
  },
};

/** Rtl: right-to-left layout keeps the cards and funnel aligned. */
export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
