import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SummerReconcileSection } from './SummerReconcileSection';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SummerReconcileSection certificate', () => {
  it('stays read-only and axe-clean when no recovery is indicated', async () => {
    const { container } = render(<SummerReconcileSection indicated={false} />);

    expect(
      screen.getByText(/No recovery indicated for this task/)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('summer-reconcile-request')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('disables the button while requesting and ignores a second click, axe-clean', async () => {
    const user = userEvent.setup();
    let resolve: (response: Response) => void = () => {};
    const fetchMock = stubFetch(
      () =>
        new Promise<Response>(done => {
          resolve = done;
        })
    );
    const { container } = render(<SummerReconcileSection indicated />);
    await expectNoA11yViolations(container);

    const button = screen.getByRole('button', { name: 'Request reconcile' });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Requesting…');
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/ovie/summer/reconcile',
      { method: 'GET', cache: 'no-store' }
    );
    await expectNoA11yViolations(container);

    resolve(
      Response.json({
        ok: true,
        persisted: 'created',
        result: { eventId: 'evt-123' },
      })
    );

    const receipt = await screen.findByTestId('summer-reconcile-receipt');
    expect(receipt).toHaveTextContent('Recorded');
    expect(receipt).toHaveTextContent('evt-123');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Request reconcile');
    await expectNoA11yViolations(container);
  });

  it('shows an existing receipt without an event id as unknown', async () => {
    const user = userEvent.setup();
    stubFetch(async () => Response.json({ ok: true, persisted: 'existing' }));
    render(<SummerReconcileSection indicated />);

    await user.click(screen.getByTestId('summer-reconcile-request'));

    const receipt = await screen.findByTestId('summer-reconcile-receipt');
    expect(receipt).toHaveTextContent('Already recorded');
    expect(receipt).toHaveTextContent('unknown');
  });

  it('shows the mapped denial for a server refusal, axe-clean', async () => {
    const user = userEvent.setup();
    stubFetch(async () =>
      Response.json(
        { ok: false, code: 'founder_access_required' },
        { status: 403 }
      )
    );
    const { container } = render(<SummerReconcileSection indicated />);

    await user.click(screen.getByTestId('summer-reconcile-request'));

    expect(
      await screen.findByTestId('summer-reconcile-denial')
    ).toHaveTextContent('Recovery denied — founder access is required.');
    expect(
      screen.queryByTestId('summer-reconcile-receipt')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports an unreachable endpoint, then an unmapped code on retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(
        Response.json({ ok: false, code: 'brand_new_code' }, { status: 409 })
      );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SummerReconcileSection indicated />);
    const button = screen.getByTestId('summer-reconcile-request');

    await user.click(button);
    expect(
      await screen.findByText(
        'Request failed — the recovery endpoint was unreachable.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(button);
    expect(
      await screen.findByText('Recovery denied (brand_new_code).')
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
