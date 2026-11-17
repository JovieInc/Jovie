import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import { InsightActions } from './InsightActions';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InsightActions certificate', () => {
  it.each([
    ['Dismiss', 'dismissed'],
    ['Done', 'acted_on'],
  ])('%s sends the %s status for this insight', async (label, status) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithQueryClient(
      <InsightActions insightId='insight-7' />
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: label }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/insights/insight-7');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ status });
  });

  it('disables both actions while the update is pending', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const { container } = renderWithQueryClient(
      <InsightActions insightId='insight-7' />
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled()
    );
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('re-enables both actions after a rejected update', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: 'Update failed' }, 500)
    );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithQueryClient(
      <InsightActions insightId='insight-7' />
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('re-enables both actions after a network failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithQueryClient(
      <div dir='rtl'>
        <InsightActions insightId='insight-7' />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled()
    );
    await expectNoA11yViolations(container);
  });
});
