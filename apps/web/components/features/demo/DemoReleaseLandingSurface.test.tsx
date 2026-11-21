import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchParams = vi.hoisted(() => ({ capture: null as string | null }));
const releaseLandingProps = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'capture' ? searchParams.capture : null),
  }),
}));

vi.mock('./DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/app/r/[slug]/ReleaseLandingPage', () => ({
  ReleaseLandingPage: ({
    providers,
    release,
  }: {
    readonly providers: { label: string; url: string }[];
    readonly release: { title: string };
  }) => (
    <div data-testid='release-landing-page'>
      {releaseLandingProps({ providers, release })}
      <h1>{release.title}</h1>
      {providers.map(provider => (
        <a key={provider.url} href={provider.url}>
          {provider.label}
        </a>
      ))}
    </div>
  ),
}));

import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoReleaseLandingSurface } from './DemoReleaseLandingSurface';

describe('DemoReleaseLandingSurface', () => {
  beforeEach(() => {
    searchParams.capture = null;
    releaseLandingProps.mockClear();
  });

  it('renders the release and streaming destinations without a preview control', () => {
    render(<DemoReleaseLandingSurface />);

    expect(screen.getByTestId('release-landing-page')).toBeInTheDocument();
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
    expect(releaseLandingProps).toHaveBeenCalledOnce();
    expect(releaseLandingProps.mock.calls[0]?.[0]).not.toHaveProperty(
      'preview'
    );
  });

  it('preserves the creator-menu capture state', () => {
    searchParams.capture = 'creator-menu';
    render(<DemoReleaseLandingSurface />);

    expect(
      screen.getByTestId('demo-release-creator-capture')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /use this sound/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('release-landing-page')).toBeNull();
  });

  it('reaches the sounds link by keyboard in the creator-menu capture with token classes', async () => {
    const user = userEvent.setup();
    searchParams.capture = 'creator-menu';
    const { container } = render(<DemoReleaseLandingSurface />);

    await user.tab();

    const link = screen.getByRole('link', { name: /use this sound/i });
    expect(link).toHaveFocus();
    expect(link.getAttribute('href')).toMatch(/\/sounds$/);
    const capture = screen.getByTestId('demo-release-creator-capture');
    expect(capture.className).toContain('border-subtle');
    expect(capture.className).not.toMatch(/white\//);
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations on the default landing state', async () => {
    const user = userEvent.setup();
    const { container } = render(<DemoReleaseLandingSurface />);

    await user.tab();

    await expectNoA11yViolations(container);
  });
});
