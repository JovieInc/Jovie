import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { v2Props, v2Chunk } = vi.hoisted(() => {
  let release: () => void = () => {};
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  return {
    v2Props: vi.fn(),
    v2Chunk: { ready, release: () => release() },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock('@/app/onboarding/actions', () => ({ completeOnboarding: vi.fn() }));
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
// The full resume-flow form is its own component with its own evidence; here
// its chunk resolves only when a test releases it, so the loading shell the
// wrapper shows can be observed first.
vi.mock('./onboarding-v2/OnboardingV2Form', async () => {
  await v2Chunk.ready;
  return {
    OnboardingV2Form: (props: Record<string, unknown>) => {
      v2Props(props);
      return <h1>Connect Spotify</h1>;
    },
  };
});

import { OnboardingFormWrapper } from './OnboardingFormWrapper';

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

function renderWrapper(
  props: Partial<ComponentProps<typeof OnboardingFormWrapper>> = {},
  dir?: 'rtl'
) {
  return render(
    <div dir={dir}>
      <OnboardingFormWrapper userId='user-1' {...props} />
    </div>
  );
}

const handleInput = () =>
  screen.getByRole('textbox', { name: 'Claim Your Handle' });

beforeEach(() => {
  v2Props.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ available: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  );
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OnboardingFormWrapper', () => {
  it('shows the handle step for a new user and marks itself hydrated', async () => {
    const { container } = renderWrapper();

    await waitFor(() =>
      expect(screen.getByTestId('onboarding-form-wrapper')).toHaveAttribute(
        'data-hydrated',
        'true'
      )
    );
    expect(handleInput()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(v2Props).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('checks a typed handle through the handle step', async () => {
    const user = userEvent.setup();
    const { container } = renderWrapper();

    await user.type(handleInput(), 'SashaWaves');

    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
      { timeout: 3000 }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/handle/check?handle=sashawaves',
      expect.anything()
    );
    await expectNoA11yViolations(container);
  });

  it('starts from a seeded handle with a long display name', async () => {
    const { container } = renderWrapper({
      initialHandle: 'theextraordinarilylongartistname',
      initialDisplayName:
        'The Extraordinarily Long Artist Name And The Midnight Orchestra',
      assumeInitialHandleAvailable: true,
    });

    expect(handleInput()).toHaveValue('theextraordinarilylongartistname');
    await expectNoA11yViolations(container);
  });

  it('shows the loading shell for a resume flow, then the full form with the resume props', async () => {
    const { container } = renderWrapper({
      initialHandle: 'sashawaves',
      initialProfileId: 'profile-1',
      initialResumeStep: 'spotify',
      existingBio: 'Synth pop',
      existingGenres: ['pop'],
    });

    expect(screen.getByTestId('onboarding-loading-shell')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Onboarding Steps Loading' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    await expectNoA11yViolations(container);

    v2Chunk.release();

    expect(
      await screen.findByRole('heading', { name: 'Connect Spotify' })
    ).toBeInTheDocument();
    expect(v2Props).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialHandle: 'sashawaves',
        initialProfileId: 'profile-1',
        initialResumeStep: 'spotify',
        existingBio: 'Synth pop',
        existingGenres: ['pop'],
        userId: 'user-1',
        isHydrated: true,
      })
    );
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = renderWrapper({}, 'rtl');

    expect(handleInput()).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
