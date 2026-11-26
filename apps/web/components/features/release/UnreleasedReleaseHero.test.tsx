import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UnreleasedReleaseHero } from './UnreleasedReleaseHero';

type LinkProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly [key: string]: unknown;
};

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt?: string; src: string }) => (
    <img alt={props.alt ?? ''} src={props.src} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  ArtistNotificationsCTA: () => null,
  ProfileInlineNotificationsCTA: () => null,
}));

vi.mock('@/features/release/ReleaseCountdown', () => ({
  ReleaseCountdown: () => null,
}));

vi.mock('./ReleaseNotificationsProvider', () => ({
  ReleaseNotificationsProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

vi.mock('./PreSaveActions', () => ({
  PreSaveActions: () => <div data-testid='pre-save-actions' />,
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function renderHero(
  overrides: {
    readonly title?: string;
    readonly name?: string;
    readonly dir?: 'rtl';
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <div dir={overrides.dir}>
        <UnreleasedReleaseHero
          release={{
            slug: 'future-release',
            title: overrides.title ?? 'Future Release',
            artworkUrl: null,
            releaseDate: new Date(Date.now() + 7 * DAY_MS),
          }}
          artist={{
            id: 'artist-1',
            name: overrides.name ?? 'Test Artist',
            handle: 'test-artist',
            avatarUrl: null,
          }}
        />
      </div>
    </QueryClientProvider>
  );
}

describe('UnreleasedReleaseHero', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // jsdom lacks pointer capture, which the vaul drawer calls on press.
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
    Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture');
  });

  it('renders the release title, artist link and pre-save actions', async () => {
    const { container } = renderHero();

    expect(
      screen.getByRole('heading', { name: 'Future Release' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test Artist' })).toHaveAttribute(
      'href',
      '/test-artist'
    );
    expect(screen.getByTestId('pre-save-actions')).toBeInTheDocument();
    // Title/artist remain mounted for route ViewTransition morph (JOV-14244).
    expect(
      screen.getByRole('heading', { name: 'Future Release' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens the menu and moves to the share sheet from its Share row', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderHero();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const shareRow = await screen.findByRole('button', { name: 'Share' });
    expect(shareRow).toHaveAttribute('data-slot', 'plain-button');
    await expectNoA11yViolations(baseElement);

    await user.click(shareRow);
    expect(
      (await screen.findAllByText('Share this release')).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Copy Link' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('keeps a long title and an RTL artist name on the page', async () => {
    const title =
      'An Extended Deluxe Edition With A Very Long Release Title That Keeps Going';
    const { container } = renderHero({ title, name: 'ليلى أحمد', dir: 'rtl' });

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ليلى أحمد' })).toBeInTheDocument();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
