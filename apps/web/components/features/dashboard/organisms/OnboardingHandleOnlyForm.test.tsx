import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { complete, replace } = vi.hoisted(() => ({
  complete: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock('@/app/onboarding/actions', () => ({ completeOnboarding: complete }));
vi.mock('@/app/onboarding/actions/connect-spotify', () => ({
  connectOnboardingSpotifyArtist: vi.fn(),
}));
vi.mock('@/app/onboarding/actions/enrich-profile', () => ({
  enrichProfileFromDsp: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), identify: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

import { OnboardingHandleOnlyForm } from './OnboardingHandleOnlyForm';

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

function answerHandleCheck(body: object, status = 200) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
}

function renderForm(
  props: Partial<ComponentProps<typeof OnboardingHandleOnlyForm>> = {},
  dir?: 'rtl'
) {
  return render(
    <div dir={dir}>
      <OnboardingHandleOnlyForm isHydrated userId='user-1' {...props} />
    </div>
  );
}

const handleInput = () =>
  screen.getByRole('textbox', { name: 'Claim Your Handle' });
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OnboardingHandleOnlyForm', () => {
  it('keeps Continue disabled until a handle is entered', async () => {
    const { container } = renderForm();

    expect(
      screen.getByRole('heading', { name: 'Choose your handle' })
    ).toBeInTheDocument();
    expect(handleInput()).toHaveValue('');
    expect(continueButton()).toBeDisabled();
    expect(screen.getByText('Enter a handle to continue')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('checks an available handle, claims it and moves to the Spotify step', async () => {
    const user = userEvent.setup();
    answerHandleCheck({ available: true });
    complete.mockResolvedValue({ username: 'sashawaves', status: 'complete' });
    const { container } = renderForm({ userEmail: 'sasha@example.com' });

    await user.type(handleInput(), 'SashaWaves');

    await waitFor(() => expect(continueButton()).toBeEnabled(), {
      timeout: 3000,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/handle/check?handle=sashawaves',
      expect.anything()
    );
    await expectNoA11yViolations(container);

    await user.click(continueButton());

    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'sashawaves',
          email: 'sasha@example.com',
        })
      )
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const [target] = replace.mock.calls.at(-1) ?? [];
    expect(String(target)).toContain('handle=sashawaves');
    expect(String(target)).toContain('resume=spotify');
  });

  it('reports a failed claim and stays on the handle step', async () => {
    const user = userEvent.setup();
    answerHandleCheck({ available: true });
    complete.mockRejectedValue(new Error('Database unavailable'));
    const { container } = renderForm();

    await user.type(handleInput(), 'sashawaves');
    await waitFor(() => expect(continueButton()).toBeEnabled(), {
      timeout: 3000,
    });
    await user.click(continueButton());

    await waitFor(() => expect(complete).toHaveBeenCalled());
    const message = await screen.findByTestId('handle-unavailable');
    expect(message).not.toBeEmptyDOMElement();
    expect(handleInput()).toHaveAttribute('aria-invalid', 'true');
    expect(replace).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('blocks a taken handle with the server reason', async () => {
    const user = userEvent.setup();
    answerHandleCheck({ available: false, error: 'Handle already taken' });
    const { container } = renderForm();

    await user.type(handleInput(), 'takenname');

    expect(
      (await screen.findAllByText('Handle already taken', {}, { timeout: 3000 }))
        .length
    ).toBeGreaterThan(0);
    expect(continueButton()).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps Continue disabled when the availability check cannot reach the server', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = renderForm();

    await user.type(handleInput(), 'offlinename');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(continueButton()).toBeDisabled();
    expect(complete).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('starts from a seeded handle the server already vouched for', async () => {
    const { container } = renderForm({
      initialHandle: 'SeededHandle',
      assumeInitialHandleAvailable: true,
    });

    expect(handleInput()).toHaveValue('seededhandle');
    await waitFor(() => expect(continueButton()).toBeEnabled(), {
      timeout: 3000,
    });
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = renderForm({}, 'rtl');

    expect(handleInput()).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
