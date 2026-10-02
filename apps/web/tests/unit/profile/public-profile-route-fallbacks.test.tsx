/**
 * Behavior tests for public profile route boundary components (JOV-5778).
 *
 * Executes the real fallback surfaces under app/[username]/**:
 * - /[username]/not-found — profile-miss 404 content inside the public shell
 * - /[username]/[slug]/not-found — content 404 with a home link
 * - /[username]/[slug]/error — client error boundary delegating to the
 *   shared public fallback with reset wired
 * - /[username]/error — profile-level boundary sharing the same fallback
 * - /[username]/[slug]/sounds/error — branded sounds error with reset and a
 *   smart-link escape link derived from route params
 * - /[username]/notifications/loading — loading skeleton
 * - generateStaticParams — build-time DB failure degrades to no params
 *
 * Related surface: public-profile-isr (docs/TEST_RISK_REGISTER.md, 75% target).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Transform the real boundary modules before starting per-behavior deadlines.
// Their mocks stay stable; no test changes module-level environment.
import '@/app/[username]/not-found';
import '@/app/[username]/[slug]/not-found';
import '@/app/[username]/[slug]/error';
import '@/app/[username]/error';
import '@/app/[username]/[slug]/sounds/error';
import '@/app/[username]/notifications/loading';
import '@/app/[username]/_lib/profile-static-params';

const { captureErrorInSentryMock, getTopProfilesForStaticGenerationMock } =
  vi.hoisted(() => ({
    captureErrorInSentryMock: vi.fn(),
    getTopProfilesForStaticGenerationMock: vi.fn(),
  }));

vi.mock('server-only', () => ({}));

vi.mock('@/components/site/PublicPageShell', () => ({
  PublicPageShell: ({ children }: { children: import('react').ReactNode }) =>
    createElement('main', null, children),
}));

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: (...args: unknown[]) =>
    captureErrorInSentryMock(...args),
}));

vi.mock('@/lib/services/profile/queries', () => ({
  getTopProfilesForStaticGeneration: (...args: unknown[]) =>
    getTopProfilesForStaticGenerationMock(...args),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ username: 'testartist', slug: 'latest-drop' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// The Icon atom is a pass-through for these assertions; keep renders cheap.
vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) =>
    createElement('span', {
      'data-testid': `icon-${name}`,
      'aria-hidden': 'true',
    }),
}));

async function importNotFound() {
  return import('@/app/[username]/not-found');
}

async function importSmartLinkNotFound() {
  return import('@/app/[username]/[slug]/not-found');
}

async function importSmartLinkError() {
  return import('@/app/[username]/[slug]/error');
}

async function importProfileError() {
  return import('@/app/[username]/error');
}

async function importSoundsError() {
  return import('@/app/[username]/[slug]/sounds/error');
}

async function importNotificationsLoading() {
  return import('@/app/[username]/notifications/loading');
}

async function importStaticParams() {
  return import('@/app/[username]/_lib/profile-static-params');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('profile-miss not-found boundary (JOV-5778)', () => {
  it('renders the 404 content for a profile lookup miss', async () => {
    const { default: NotFound } = await importNotFound();

    render(createElement(NotFound));

    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });
});

describe('smart-link content not-found boundary (JOV-5778)', () => {
  it('renders content-404 copy with a home link', async () => {
    const { default: SmartLinkNotFound } = await importSmartLinkNotFound();

    render(createElement(SmartLinkNotFound));

    expect(screen.getByTestId('not-found')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Content Not Found' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
      'href',
      '/'
    );
  });
});

describe('smart-link error boundary (JOV-5778)', () => {
  it('delegates to the shared public fallback with the Content context', async () => {
    const { default: SmartLinkError } = await importSmartLinkError();
    const error = Object.assign(new Error('render failed'), {
      digest: 'digest-1',
    });

    render(createElement(SmartLinkError, { error, reset: vi.fn() }));

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' })
    ).toBeInTheDocument();
    expect(captureErrorInSentryMock).toHaveBeenCalledWith(error, 'Content', {
      digest: 'digest-1',
    });
  });
});

describe('profile-level error boundary (JOV-5778)', () => {
  it('delegates to the shared public fallback with the Profile context', async () => {
    const { default: ProfileError } = await importProfileError();
    const error = Object.assign(new Error('boom'), { digest: 'digest-2' });

    render(createElement(ProfileError, { error, reset: vi.fn() }));

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' })
    ).toBeInTheDocument();
    expect(captureErrorInSentryMock).toHaveBeenCalledWith(error, 'Profile', {
      digest: 'digest-2',
    });
  });
});

describe('sounds error boundary (JOV-5778)', () => {
  it('renders branded recovery with reset and a smart-link escape link', async () => {
    const { default: SoundsErrorBoundary } = await importSoundsError();
    const reset = vi.fn();

    render(
      createElement(SoundsErrorBoundary, {
        error: Object.assign(new Error('db pool exhausted'), {
          digest: 'digest-3',
        }),
        reset,
      })
    );

    expect(
      screen.getByRole('heading', { name: 'Something Went Wrong' })
    ).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /Try again/i });
    await userEvent.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
    // Escape link derives from route params (username + slug).
    expect(
      screen.getByRole('link', { name: /Go to streaming links/i })
    ).toBeInTheDocument();
  });
});

describe('notifications loading skeleton (JOV-5778)', () => {
  it('renders the loading skeleton without content flashes', async () => {
    const { default: NotificationsLoading } =
      await importNotificationsLoading();

    const { container } = render(createElement(NotificationsLoading));

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});

describe('profile static params (JOV-5778)', () => {
  it('returns build-time params for the top profiles', async () => {
    getTopProfilesForStaticGenerationMock.mockResolvedValue([
      { username: 'dualipa' },
      { username: 'testartist' },
    ]);
    const { getProfileStaticParams } = await importStaticParams();

    const params = await getProfileStaticParams(100);

    expect(params).toEqual([
      { username: 'dualipa' },
      { username: 'testartist' },
    ]);
    expect(getTopProfilesForStaticGenerationMock).toHaveBeenCalledWith(100);
  });

  it('degrades a build-time DB failure to an empty param list', async () => {
    getTopProfilesForStaticGenerationMock.mockRejectedValue(
      new Error('neon cold start')
    );
    const { getProfileStaticParams } = await importStaticParams();

    const params = await getProfileStaticParams(100);

    expect(params).toEqual([]);
  });
});
