import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistRoleForm } from './WaitlistRoleForm';

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => null,
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
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: ' Alex Example ' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'A team' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    vi.spyOn(
      screen.getByTestId('waitlist-role-form'),
      'getBoundingClientRect'
    ).mockReturnValue({ height: 420 } as DOMRect);
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    const confirmation = await screen.findByTestId('waitlist-role-form-joined');
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveStyle({ minHeight: '420px' });
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
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Your name'), {
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
