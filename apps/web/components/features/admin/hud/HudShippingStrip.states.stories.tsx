import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { measuredCount } from '@/lib/ovie/shipping-state/contract';
import {
  createEmptyShippingStateView,
  type ShippingStateView,
} from '@/lib/ovie/shipping-state-client';
import {
  cockpitShipping,
  cockpitShippingWithDeployHealth,
} from '@/tests/fixtures/hud-cockpit';
import { HudShippingStrip } from './HudShippingStrip';

const meta = {
  title: 'Features/Admin/Hud/HudShippingStrip States',
  component: HudShippingStrip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudShippingStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing measured yet, so every chip shows the em dash. */
export const EmptyNothingMeasured: Story = {
  args: { view: createEmptyShippingStateView() },
};

const failing: ShippingStateView = {
  ...cockpitShippingWithDeployHealth({
    observedAt: '2026-10-25T06:40:00.000Z',
    healthy: false,
    repos: [
      {
        repo: 'JovieInc/LogYourBody',
        status: 'failing',
        failedStreak: 15,
        behindMain: 54,
        oldestUnshippedAgeSeconds: 140083,
        lastSuccessAt: '2026-10-23T16:03:00.000Z',
      },
    ],
    lag: [
      {
        repo: 'JovieInc/Jovie',
        p50Min: 38,
        p95Min: 212,
        samples: 41,
        targetP50Min: 20,
        targetP95Min: 60,
      },
    ],
  }),
  ciGreen: { value: false, measurement: 'measured' },
};

/** Error: CI failing, prod lag over target and LogYourBody deploys red. */
export const ErrorCiAndDeploysFailing: Story = { args: { view: failing } };

const large: ShippingStateView = {
  ...failing,
  delivery: {
    ...failing.delivery,
    mergeQueueDepth: measuredCount(1284),
    inFlight: measuredCount(9731),
    merges: {
      ...failing.delivery.merges,
      last7Days: measuredCount(48213),
      prior7Days: measuredCount(1207),
    },
    production: {
      ...failing.delivery.production,
      behindMain: measuredCount(15872),
    },
  },
};

function NarrowStrip(args: { readonly view: ShippingStateView }) {
  return (
    <div className='w-96'>
      <HudShippingStrip {...args} />
    </div>
  );
}

/** Long content: large counts wrap the chips onto several rows. */
export const LongContentLargeCounts: Story = {
  args: { view: large },
  render: NarrowStrip,
};

function RtlStrip(args: { readonly view: ShippingStateView }) {
  return (
    <div dir='rtl' lang='ar'>
      <HudShippingStrip {...args} />
    </div>
  );
}

/** RTL: chips flow from the right and the link sits at the left edge. */
export const RtlShippingStrip: Story = {
  args: { view: cockpitShipping },
  render: RtlStrip,
};
