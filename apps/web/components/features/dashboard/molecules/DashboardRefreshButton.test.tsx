import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, use, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardRefreshButton } from './DashboardRefreshButton';

function SlowRefreshFrame({ pending }: Readonly<{ pending: Promise<void> }>) {
  const [version, setVersion] = useState(0);
  return (
    <>
      <DashboardRefreshButton onRefresh={() => setVersion(v => v + 1)} />
      <Suspense fallback={<span>Refreshing</span>}>
        <Data version={version} pending={pending} />
      </Suspense>
    </>
  );
}

function Data({
  version,
  pending,
}: Readonly<{ version: number; pending: Promise<void> }>) {
  if (version > 0) use(pending);
  return <span>Data v{version}</span>;
}

describe('DashboardRefreshButton', () => {
  it('runs onRefresh then onRefreshed on press', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const onRefresh = vi.fn(() => calls.push('refresh'));
    const onRefreshed = vi.fn(() => calls.push('refreshed'));
    const { container } = render(
      <DashboardRefreshButton
        ariaLabel='Refresh analytics'
        onRefresh={onRefresh}
        onRefreshed={onRefreshed}
      />
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Refresh analytics' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['refresh', 'refreshed']);
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('works with no callbacks', async () => {
    const user = userEvent.setup();
    render(<DashboardRefreshButton />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('spins and disables while the refresh transition is pending', async () => {
    const user = userEvent.setup();
    const pending = new Promise<void>(() => {});
    const { container } = render(<SlowRefreshFrame pending={pending} />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled());
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
    expect(screen.getByText('Data v0')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
