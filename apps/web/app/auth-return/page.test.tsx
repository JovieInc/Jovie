import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchParamsMock } = vi.hoisted(() => ({
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
  }) => <a href={href}>{children}</a>,
}));

import AuthReturnPage from './page';

function setSearchParams(query: string) {
  searchParamsMock.mockReturnValue(new URLSearchParams(query));
}

function setLocationOrigin(origin: string) {
  const hrefWrites: string[] = [];
  let href = `${origin}/`;

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      origin,
      get href() {
        return href;
      },
      set href(value: string) {
        href = value;
        hrefWrites.push(value);
      },
    },
  });

  return hrefWrites;
}

describe('AuthReturnPage (legacy desktop auth bounce)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocationOrigin('https://jov.ie');
  });

  it('renders an Open Jovie button pointing at the production deep link', () => {
    const hrefWrites = setLocationOrigin('https://jov.ie');
    setSearchParams('route=%2Fapp%2Fsettings');
    render(<AuthReturnPage />);

    const expectedDeepLink = 'jovie://auth-return?route=%2Fapp%2Fsettings';
    expect(screen.getByRole('link', { name: 'Open Jovie' })).toHaveAttribute(
      'href',
      expectedDeepLink
    );
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('uses the staging app scheme on staging origin', () => {
    const hrefWrites = setLocationOrigin('https://staging.jov.ie');
    setSearchParams('route=%2Fapp%2Fsettings');
    render(<AuthReturnPage />);

    const expectedDeepLink =
      'jovie-staging://auth-return?route=%2Fapp%2Fsettings';
    expect(screen.getByRole('link', { name: 'Open Jovie' })).toHaveAttribute(
      'href',
      expectedDeepLink
    );
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('uses the local app scheme on localhost origin', () => {
    const hrefWrites = setLocationOrigin('http://localhost:3112');
    setSearchParams('route=%2Fapp%2Fsettings');
    render(<AuthReturnPage />);

    const expectedDeepLink =
      'jovie-local://auth-return?route=%2Fapp%2Fsettings';
    expect(screen.getByRole('link', { name: 'Open Jovie' })).toHaveAttribute(
      'href',
      expectedDeepLink
    );
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('renders safely before browser location is available', () => {
    Reflect.deleteProperty(globalThis, 'location');
    setSearchParams('route=%2Fapp%2Fsettings');

    expect(() => render(<AuthReturnPage />)).not.toThrow();
    expect(screen.queryByRole('link', { name: 'Open Jovie' })).toBeNull();
  });
});
