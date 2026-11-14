import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FlagRow, OrphanOverrides, PlanToggle } from './DevToolbarRows';

vi.mock('@/lib/queries/useBillingStatusQuery', () => ({
  useBillingStatusQuery: () => ({ data: { plan: 'free' } }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DevToolbarRows', () => {
  it('toggles and clears a flag override', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const onClear = vi.fn();
    const { container } = render(
      <FlagRow
        label='Spotify OAuth'
        isOverridden
        checked={false}
        serverDefault
        onCheckedChange={onCheckedChange}
        onClear={onClear}
      />
    );

    await user.click(
      screen.getByRole('switch', { name: 'Override Spotify OAuth' })
    );
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('server: on')).toBeInTheDocument();

    await user.click(screen.getByTitle('Remove override'));
    expect(onClear).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('names the flag source when it is not overridden', async () => {
    const { container } = render(
      <FlagRow
        label='claim handle'
        isOverridden={false}
        checked={false}
        source='code'
        onCheckedChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.queryByTitle('Remove override')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('labels orphans in sentence case with the warning token, then inspects and purges them', async () => {
    const user = userEvent.setup();
    const onPurge = vi.fn();
    const { container } = render(
      <OrphanOverrides keys={['retired-flag', 'old-flag']} onPurge={onPurge} />
    );

    const heading = screen.getByText('Orphans (2)');
    expect(heading).not.toHaveClass('uppercase');
    expect(heading).toHaveClass('text-warning');
    expect(screen.queryByText('retired-flag')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(screen.getByText('retired-flag')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Purge' }));
    expect(onPurge).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows an empty orphan list', async () => {
    const { container } = render(
      <OrphanOverrides keys={[]} onPurge={vi.fn()} />
    );

    expect(screen.getByText('Orphans (0)')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders no plan toggle outside a query client', () => {
    const { container } = render(<PlanToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it('switches the plan and refreshes billing', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <PlanToggle />
      </QueryClientProvider>
    );

    await user.click(
      screen.getByRole('button', { name: 'Switch to free plan' })
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Switch to pro plan' })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/set-plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ plan: 'pro' }),
      })
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    await expectNoA11yViolations(container);
  });
});
