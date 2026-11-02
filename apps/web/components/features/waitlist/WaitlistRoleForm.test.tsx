import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvisibleTurnstileState } from '@/components/atoms/InvisibleTurnstile';
import { WaitlistRoleForm } from './WaitlistRoleForm';

const challenge = vi.hoisted(() => ({
  onStateChange: undefined as
    | ((state: InvisibleTurnstileState) => void)
    | undefined,
}));
vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: ({
    onStateChange,
  }: {
    onStateChange: (state: InvisibleTurnstileState) => void;
  }) => {
    challenge.onStateChange = onStateChange;
    return <span hidden data-testid='turnstile-mock' />;
  },
  isTurnstileClientBypassed: () => true,
  isTurnstileClientConfigured: () => false,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

describe('WaitlistRoleForm', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers every role in Title Case', () => {
    render(<WaitlistRoleForm />);
    for (const label of [
      'Artist',
      'Manager',
      'Label',
      'Producer/Songwriter',
      'Other',
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('captures a name and a general role on the company homepage without assuming an industry', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm variant='general' headingLevel={3} />);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Request access' })
    ).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Artist' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Alex Example ' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'A team' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    const form = screen.getByTestId('waitlist-role-form');
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    const confirmation = await screen.findByTestId('waitlist-role-form-joined');
    await waitFor(() => expect(confirmation).toHaveFocus());
    expect(form).toHaveClass('invisible', 'col-start-1', 'row-start-1');
    expect(form).toHaveAttribute('inert');
    expect(form).toHaveAttribute('aria-hidden', 'true');
    expect(confirmation).toHaveClass('col-start-1', 'row-start-1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      name: 'Alex Example',
      role: 'team',
      email: 'person@example.com',
    });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Request received' })
    ).toBeVisible();
  });

  it('requires a useful name on the general form before sending a join', async () => {
    render(<WaitlistRoleForm variant='general' />);
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter your name.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alex' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks for a role before submitting', async () => {
    render(<WaitlistRoleForm />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose the role'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits role and email, then confirms the spot', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm />);
    fireEvent.click(screen.getByRole('radio', { name: 'Label' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));

    await waitFor(() =>
      expect(screen.getByTestId('waitlist-role-form-joined')).toBeVisible()
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/waitlist/join');
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: 'person@example.com',
      role: 'label',
    });
  });

  it('recovers a stalled join after 15 seconds and preserves input for retry', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
        ms
      );
      return controller.signal;
    });
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          );
        })
    );
    render(<WaitlistRoleForm variant='general' />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alex Example' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'A team' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(screen.getByRole('button')).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.queryByRole('alert')).toHaveTextContent(
      'Request timed out. Please try again.'
    );
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(screen.getByLabelText('Name')).toHaveValue('Alex Example');
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'person@example.com'
    );
    expect(screen.getByRole('radio', { name: 'A team' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    vi.useRealTimers();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(
      await screen.findByTestId('waitlist-role-form-joined')
    ).toHaveFocus();
  });

  it('keeps the focused confirmation after a queued challenge failure arrives', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm />);
    const lateFailure = challenge.onStateChange;
    expect(lateFailure).toBeTypeOf('function');
    fireEvent.click(screen.getByRole('radio', { name: 'Artist' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    const confirmation = await screen.findByTestId('waitlist-role-form-joined');
    await waitFor(() => expect(confirmation).toHaveFocus());
    act(() =>
      lateFailure?.({ status: 'expired', message: 'Challenge expired.' })
    );
    expect(confirmation).toBeInTheDocument();
    expect(confirmation).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('turnstile-mock')).toBeNull();
    expect(screen.getByTestId('waitlist-role-form')).toHaveAttribute('inert');
  });

  it('keeps the input and shows the server error on failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many requests.' }), {
        status: 429,
      })
    );
    render(<WaitlistRoleForm />);
    fireEvent.click(screen.getByRole('radio', { name: 'Artist' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests.'
    );
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'person@example.com'
    );
  });
});
