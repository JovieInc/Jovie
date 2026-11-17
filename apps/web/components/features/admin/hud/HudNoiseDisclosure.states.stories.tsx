import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HudNoiseDisclosure,
  type HudNoiseDisclosureProps,
} from './HudNoiseDisclosure';

const meta = {
  title: 'Features/Admin/HudNoiseDisclosure States',
  component: HudNoiseDisclosure,
  parameters: { layout: 'centered' },
  args: {
    id: 'flaky-tests',
    label: 'Flaky test noise (12)',
    children: (
      <p className='text-xs text-secondary-token'>
        12 unit tests flagged as flaky over the last 24h.
      </p>
    ),
  },
} satisfies Meta<typeof HudNoiseDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

function NarrowDisclosure(args: HudNoiseDisclosureProps) {
  return (
    <div className='w-72'>
      <HudNoiseDisclosure {...args} />
    </div>
  );
}

/** Long content: a label that wraps inside a narrow column. */
export const LongContentWrappingLabel: Story = {
  args: {
    id: 'long-label',
    label:
      'Demoted velocity, agent and quarantine tiles that stay below the alerting threshold until the next weekly review (148)',
    children: (
      <p className='text-xs text-secondary-token'>
        These bands were demoted because none of them changed a founder decision
        in the last thirty days. Open them when a number above looks wrong and
        you need the supporting detail before escalating.
      </p>
    ),
  },
  render: NarrowDisclosure,
};

function RtlDisclosure(args: HudNoiseDisclosureProps) {
  return (
    <div dir='rtl' lang='ar' className='w-72'>
      <HudNoiseDisclosure {...args} />
    </div>
  );
}

/** RTL: Arabic label and body in a right-to-left container. */
export const RtlArabicLabel: Story = {
  args: {
    id: 'rtl',
    label: 'ضوضاء الاختبارات غير المستقرة (12)',
    children: (
      <p className='text-xs text-secondary-token'>
        تم وضع علامة على 12 اختبارًا كغير مستقرة خلال آخر 24 ساعة.
      </p>
    ),
  },
  render: RtlDisclosure,
};
