import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { isSsrNowMs, NowMsProvider, useNowMs } from './NowMsContext';

/**
 * NowMsContext supplies a stable "now" timestamp to relative-time cells
 * without making the audience table's column definitions time-dependent.
 * There's no visual output of its own; this story renders a consumer to
 * demonstrate the SSR-safe hydration behavior.
 */
function NowMsConsumerDemo() {
  const nowMs = useNowMs();
  return (
    <div className='text-app text-secondary-token'>
      <p>now: {nowMs}</p>
      <p>{isSsrNowMs(nowMs) ? 'SSR placeholder value' : 'hydrated value'}</p>
    </div>
  );
}

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/NowMsContext',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof NowMsConsumerDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithProvider: Story = {
  render: () => (
    <NowMsProvider>
      <NowMsConsumerDemo />
    </NowMsProvider>
  ),
};
