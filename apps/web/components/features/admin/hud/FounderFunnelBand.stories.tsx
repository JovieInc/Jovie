'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import type { FounderFunnelData, FounderFunnelStage } from '@/lib/admin/types';
import { FounderFunnelBand } from './FounderFunnelBand';

function stage(
  overrides: Partial<FounderFunnelStage> &
    Pick<FounderFunnelStage, 'key' | 'label' | 'count'>
): FounderFunnelStage {
  return {
    description: 'A step in the onboarding funnel',
    conversionRate: null,
    dropOff: null,
    identifiable: true,
    drillDownHref: `/app/ov/growth?view=leads&funnelStage=${overrides.key}&funnelRange=30d`,
    ...overrides,
  };
}

const funnel: FounderFunnelData = {
  timeRange: '30d',
  biggestDropOffKey: 'accounts_created',
  errors: [],
  definitionVersion: 'founder-funnel.v2',
  stages: [
    stage({
      key: 'onboarding_chats',
      label: 'Onboarding chats',
      count: 1200,
      identifiable: false,
      drillDownHref: null,
    }),
    stage({
      key: 'accounts_created',
      label: 'Accounts created',
      count: 300,
      conversionRate: 0.25,
      dropOff: 900,
    }),
    stage({
      key: 'profiles_claimed',
      label: 'Profiles claimed',
      count: 180,
      conversionRate: 0.6,
      dropOff: 120,
    }),
    stage({
      key: 'paid',
      label: 'Paid',
      count: 12,
      conversionRate: 0.067,
      dropOff: 168,
    }),
  ],
};

/**
 * Replaces fetch before the band's own query fires (layout effects run before
 * passive effects) so the no-initial-data states are deterministic.
 */
function MockFunnelFetch({
  mode,
  children,
}: Readonly<{
  readonly mode: 'pending' | 'offline';
  readonly children: ReactNode;
}>) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      mode === 'pending'
        ? new Promise<Response>(() => {})
        : Promise.reject(new TypeError('Failed to fetch'));
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode]);

  return children;
}

const meta = {
  title: 'Features/Admin/Hud/FounderFunnelBand',
  component: FounderFunnelBand,
  parameters: {
    jovie: {
      uncoveredProps: ['isLoading'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof FounderFunnelBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loaded: Story = { args: { initialFunnel: funnel } };

export const Loading: Story = {
  render: () => (
    <MockFunnelFetch mode='pending'>
      <FounderFunnelBand />
    </MockFunnelFetch>
  ),
};

export const Offline: Story = {
  render: () => (
    <MockFunnelFetch mode='offline'>
      <FounderFunnelBand />
    </MockFunnelFetch>
  ),
};

/** Every count is zero: shown as an honest empty observation, not zeros. */
export const Empty: Story = {
  args: {
    initialFunnel: {
      ...funnel,
      biggestDropOffKey: null,
      stages: funnel.stages.map(item => ({
        ...item,
        count: 0,
        dropOff: null,
        conversionRate: null,
      })),
    },
  },
};

/** The server answered but one of its queries failed. */
export const ErrorState: Story = {
  args: {
    initialFunnel: { ...funnel, errors: ['Paid stage query timed out'] },
  },
};

/** Some stages have no entrants from the previous step. */
export const Partial: Story = {
  args: {
    initialFunnel: {
      ...funnel,
      biggestDropOffKey: null,
      stages: funnel.stages.map((item, index) =>
        index > 1
          ? { ...item, count: 0, dropOff: null, conversionRate: null }
          : item
      ),
    },
  },
};

export const LongContent: Story = {
  args: {
    initialFunnel: {
      ...funnel,
      stages: funnel.stages.map((item, index) =>
        index === 1
          ? {
              ...item,
              label:
                'Accounts created through a deliberately very long stage label',
              count: 1234567,
            }
          : item
      ),
    },
  },
  decorators: [
    Story => (
      <div className='w-[min(36rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
};

export const RtlOverflow: Story = {
  args: { initialFunnel: funnel },
  decorators: [
    Story => (
      <div dir='rtl' className='w-[min(24rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
};
