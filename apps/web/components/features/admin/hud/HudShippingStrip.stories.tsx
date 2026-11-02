import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitShipping } from '@/tests/fixtures/hud-cockpit';
import { HudShippingStrip } from './HudShippingStrip';

const meta = {
  title: 'Features/Admin/Hud/HudShippingStrip',
  component: HudShippingStrip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudShippingStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { view: cockpitShipping } };

export const LogYourBodyFailing: Story = {
  args: {
    view: {
      ...cockpitShipping,
      delivery: {
        ...cockpitShipping.delivery,
        lanes: {
          ...cockpitShipping.delivery.lanes,
          deployHealth: {
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
          },
        },
      },
    },
  },
};
