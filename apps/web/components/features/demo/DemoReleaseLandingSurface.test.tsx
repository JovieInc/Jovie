import { render, screen } from '@testing-library/react';
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
});
