import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { MeasuredValue } from './MeasuredValue';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-48'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/MeasuredValue States',
  component: MeasuredValue,
  parameters: { layout: 'padded' },
  args: { state: 'measured', value: '92', source: 'GitHub' },
} satisfies Meta<typeof MeasuredValue>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a stale reading whose source never reported an age. */
export const PartialStaleWithoutAge: Story = {
  args: { state: 'stale', value: '4/5', source: 'Lanes feed' },
};

/** Long content: a long source name and reason in a narrow cell. */
export const LongContentUnknownSource: Story = {
  args: {
    state: 'unknown',
    source: 'Spotify for Artists streaming analytics export',
    reason: 'the connection was refused after three retries',
    ageMs: 2 * 86_400_000,
  },
  decorators: [CanvasFrame],
};

/** Right-to-left: a stale reading inside an RTL document. */
export const RtlStaleReading: Story = {
  args: {
    state: 'stale',
    value: '١٢٨',
    source: 'موجز المسارات',
    ageMs: 720_000,
  },
  decorators: [RtlFrame],
};
