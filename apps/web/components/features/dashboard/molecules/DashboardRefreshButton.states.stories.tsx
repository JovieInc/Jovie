import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Suspense, use, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DashboardRefreshButton } from './DashboardRefreshButton';

const NEVER = new Promise<never>(() => {});

/** Suspends forever once a refresh has been requested, like a slow route refresh. */
function RefreshedData({ version }: Readonly<{ version: number }>) {
  if (version > 0) use(NEVER);
  return <span>Data loaded</span>;
}

function SlowRefreshFrame() {
  const [version, setVersion] = useState(0);
  return (
    <div className='flex items-center gap-3'>
      <DashboardRefreshButton onRefresh={() => setVersion(v => v + 1)} />
      <Suspense fallback={<span>Refreshing</span>}>
        <RefreshedData version={version} />
      </Suspense>
    </div>
  );
}

/**
 * State coverage for DashboardRefreshButton. The button runs the caller's
 * refresh inside a transition; the loading story's refresh never settles, so
 * the transition stays pending and the button shows its spinning, disabled
 * state.
 */
const meta: Meta<typeof DashboardRefreshButton> = {
  title: 'Dashboard/Molecules/DashboardRefreshButton States',
  component: DashboardRefreshButton,
  parameters: {
    layout: 'padded',
  },
  args: {
    ariaLabel: 'Refresh',
  },
};

export default meta;
type Story = StoryObj<typeof DashboardRefreshButton>;

/** Loading: the refresh is still in flight, so the button spins and is disabled. */
export const LoadingRefreshPending: Story = {
  render: () => <SlowRefreshFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    );
  },
};
