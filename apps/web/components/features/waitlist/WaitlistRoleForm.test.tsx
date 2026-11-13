import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvisibleTurnstileState } from '@/components/atoms/InvisibleTurnstile';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistRoleForm } from './WaitlistRoleForm';

const challenge = vi.hoisted(() => ({
  onStateChange: undefined as
    | ((state: InvisibleTurnstileState) => void)
    | undefined,
}));
// Read the latest handler without the caller's narrowing sticking to it.
const currentStateHandler = () => challenge.onStateChange;
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

  it('names the action in the host page words with one support line', () => {
    render(
      <WaitlistRoleForm
        headingLevel={2}
        title='Claim your handle.'
        description='Your page goes up at jov.ie/yourname.'
        headingClassName='marketing-type-section'
        align='start'
      />
    );
    expect(screen.getByTestId('waitlist-role-form')).toHaveClass('items-start');
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Claim your handle.',
    });
    expect(heading).toHaveClass('marketing-type-section');
    expect(heading).not.toHaveClass('text-xl');
    expect(
      screen.getByText('Your page goes up at jov.ie/yourname.')
    ).toBeVisible();
    expect(screen.getByRole('form')).toHaveAccessibleName('Claim your handle.');
  });

  it('keeps the default heading and no support line when the host passes none', () => {
    render(<WaitlistRoleForm />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Reserve your spot' })
    ).toHaveClass('text-xl');
    expect(
      screen
        .getByTestId('waitlist-role-form')
        .querySelector('p.text-secondary-token')
    ).toBeNull();
  });

  it('offers the homepage role choices, in the same order, on /waitlist', () => {
    const { unmount } = render(<WaitlistRoleForm presentation='chips' />);
    const chipLabels = screen
      .getAllByRole('radio')
      .map(radio => radio.closest('label')?.textContent);
    unmount();

    render(<WaitlistRoleForm />);
    const radioLabels = screen
      .getAllByRole('radio')
      .map(radio => radio.closest('label')?.textContent);
    expect(radioLabels).toEqual([
      'Artist',
      'Manager',
      'Label',
      'Producer',
      'Songwriter',
      'Other',
    ]);
    expect(radioLabels).toEqual(chipLabels);
    // The choices span the form so they start on the email field's edge.
    expect(screen.getByTestId('waitlist-role-radios')).toHaveClass('w-full');
  });

  it('stores Producer and Songwriter radios as the one producer_songwriter role', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm />);
    fireEvent.click(screen.getByRole('radio', { name: 'Songwriter' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'tim@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).role).toBe(
      'producer_songwriter'
    );
  });

  it('captures a name and a general role on the company homepage without assuming an industry', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm variant='general' headingLevel={3} />);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Reserve your spot' })
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
      screen.getByRole('heading', {
        level: 3,
        name: "You're on the waitlist.",
      })
    ).toBeVisible();
    expect(confirmation).toHaveTextContent('person@example.com');
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

  it('sends an artist straight through when the host does not ask the questions', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm />);
    fireEvent.click(screen.getByRole('radio', { name: 'Artist' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'artist@example.com' },
    });
    expect(screen.queryByTestId('waitlist-step-counter')).toBeNull();
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('momTest');
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
    // Submitting keeps the button and email field focusable (aria-disabled,
    // readOnly) instead of native disabled, so focus is not dropped.
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button')).not.toBeDisabled();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
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
    // Focus moves in an effect after the confirmation renders.
    const confirmation = await screen.findByTestId('waitlist-role-form-joined');
    await waitFor(() => expect(confirmation).toHaveFocus());
  });

  it('loads the security check only once the visitor touches the form', () => {
    render(<WaitlistRoleForm />);
    expect(screen.queryByTestId('turnstile-mock')).toBeNull();
    fireEvent.focus(screen.getByLabelText('Email address'));
    expect(screen.getByTestId('turnstile-mock')).toBeInTheDocument();
  });

  it('keeps the focused confirmation after a queued challenge failure arrives', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    render(<WaitlistRoleForm />);
    challenge.onStateChange = undefined;
    fireEvent.focus(screen.getByLabelText('Email address'));
    const lateFailure = currentStateHandler();
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

  it('asks for a full email instead of sending one without a domain', () => {
    render(<WaitlistRoleForm />);
    fireEvent.click(screen.getByRole('radio', { name: 'Artist' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@gmail' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a full email address, like name@example.com.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('chips presentation preselects Artist and maps Producer and Songwriter to one role', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'joined' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <WaitlistRoleForm
        presentation='chips'
        headingLevel={2}
        title='Claim your handle.'
        submitLabel='Claim your handle'
        note='One email when your spot opens. Nothing else.'
      />
    );
    expect(screen.getByRole('radio', { name: 'Artist' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Songwriter' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'tim@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Claim your handle' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).role).toBe(
      'producer_songwriter'
    );
    vi.unstubAllGlobals();
  });

  it('moves the chip selection with the arrow keys and keeps one role checked', async () => {
    const user = userEvent.setup();
    render(<WaitlistRoleForm presentation='chips' />);
    const artist = screen.getByRole('radio', { name: 'Artist' });
    expect(artist).toHaveClass('sr-only');
    expect(artist.closest('label')).toHaveAttribute('data-selected', 'true');

    await user.click(screen.getByText('Manager'));
    const manager = screen.getByRole('radio', { name: 'Manager' });
    expect(manager).toBeChecked();
    expect(manager).toHaveFocus();
    expect(manager.closest('label')).toHaveAttribute('data-selected', 'true');
    expect(artist.closest('label')).not.toHaveAttribute('data-selected');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Label' })).toBeChecked();
    expect(manager).not.toBeChecked();
  });

  it('keeps the typed email, the chosen chip and focus across a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <WaitlistRoleForm presentation='chips' note='One email, nothing else.' />
    );
    await user.click(screen.getByText('Producer'));
    const email = screen.getByLabelText('Email address');
    await user.type(email, 'person@example.com');
    expect(email).toHaveValue('person@example.com');

    rerender(
      <WaitlistRoleForm presentation='chips' note='We read every request.' />
    );
    expect(screen.getByLabelText('Email address')).toBe(email);
    expect(email).toHaveValue('person@example.com');
    expect(email).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Producer' })).toBeChecked();

    await user.keyboard('{Escape}');
    expect(email).toHaveValue('person@example.com');
    expect(email).toHaveFocus();

    fireEvent.blur(email);
    expect(email).toHaveValue('person@example.com');
  });

  it('keeps a typed name across a rerender on the general form', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WaitlistRoleForm variant='general' />);
    const name = screen.getByLabelText('Name');
    await user.type(name, 'Alex Example');
    rerender(<WaitlistRoleForm variant='general' description='Say hi.' />);
    expect(name).toHaveValue('Alex Example');
    expect(name).toHaveFocus();
  });

  it('has no axe violations in the stack, general and chips forms', async () => {
    for (const form of [
      <WaitlistRoleForm key='stack' />,
      <WaitlistRoleForm
        key='general'
        variant='general'
        headingLevel={2}
        description='We open to a small group at a time.'
      />,
      <WaitlistRoleForm
        key='chips'
        presentation='chips'
        note='One email when your invite is ready.'
      />,
    ]) {
      const { container, unmount } = render(form);
      await expectNoA11yViolations(container);
      unmount();
    }
  });

  it('has no axe violations while submitting, on an error and once joined', async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>(resolve => {
        finish = resolve;
      })
    );
    const { container } = render(<WaitlistRoleForm presentation='chips' />);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.submit(screen.getByTestId('waitlist-role-form'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await expectNoA11yViolations(container);

    await act(async () => {
      finish(
        new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
      );
    });
    await screen.findByTestId('waitlist-role-form-joined');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl'>
        <WaitlistRoleForm presentation='chips' title='اطلب دعوة' />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
