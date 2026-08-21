import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchParamsMock, pathnameMock } = vi.hoisted(() => ({
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  pathnameMock: vi.fn(() => '/auth/native-return'),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  usePathname: () => pathnameMock(),
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

import NativeReturnPage from './page';

const CODE = '00000000000040008000000000000001';
const STATE = 'abcdef0123456789abcdef0123456789';
const FLOW = 'htmjTw7x7kSYKEPuInDfGOJ0U9q56p4Y';

function setSearchParams(query: string) {
  searchParamsMock.mockReturnValue(new URLSearchParams(query));
}

function setPathname(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
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

describe('NativeReturnPage (native auth bounce)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPathname('/auth/native-return');
    // jsdom cannot navigate to a custom scheme; swallow the auto-fire assign.
    setLocationOrigin('https://jov.ie');
  });

  it('renders a Return to Jovie button pointing at the jovie:// deep link', () => {
    const hrefWrites = setLocationOrigin('https://jov.ie');
    setSearchParams(`code=${CODE}&state=${STATE}&desktop_flow=${FLOW}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `jovie://auth/complete?code=${CODE}&state=${STATE}&desktop_flow=${FLOW}`;
    const link = screen.getByRole('link', { name: 'Return to Jovie' });
    expect(link).toHaveAttribute('href', expectedDeepLink);
    expect(hrefWrites).toEqual([expectedDeepLink]);
    expect(
      screen.getByRole('heading', { name: 'Return to Jovie' })
    ).toBeVisible();
    expect(
      screen.getByText('Authentication is complete. Return to Jovie.')
    ).toBeVisible();
    expect(screen.queryByText('Jovie Desktop')).toBeNull();
  });

  it('preserves the deep link without desktop_flow when absent', () => {
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute(
      'href',
      `jovie://auth/complete?code=${CODE}&state=${STATE}`
    );
  });

  it('uses the staging app scheme on staging origin', () => {
    const hrefWrites = setLocationOrigin('https://staging.jov.ie');
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `jovie-staging://auth/complete?code=${CODE}&state=${STATE}`;
    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute('href', expectedDeepLink);
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('uses the local app scheme on localhost origin', () => {
    const hrefWrites = setLocationOrigin('http://localhost:3112');
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `jovie-local://auth/complete?code=${CODE}&state=${STATE}`;
    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute('href', expectedDeepLink);
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('renders safely before browser location is available', () => {
    Reflect.deleteProperty(globalThis, 'location');
    setSearchParams(`code=${CODE}&state=${STATE}`);

    expect(() => render(<NativeReturnPage />)).not.toThrow();
    expect(screen.queryByRole('link', { name: 'Return to Jovie' })).toBeNull();
  });

  it('shows a recovery message and no deep link when required params are missing', () => {
    setSearchParams(`state=${STATE}`);
    render(<NativeReturnPage />);

    expect(screen.queryByRole('link', { name: 'Return to Jovie' })).toBeNull();
    expect(
      screen.getByText(/missing required information/i)
    ).toBeInTheDocument();
  });

  it('rejects a malformed exchange code (no scheme injection)', () => {
    setSearchParams(`code=jovie%3A%2F%2Fevil&state=${STATE}`);
    render(<NativeReturnPage />);

    expect(screen.queryByRole('link', { name: 'Return to Jovie' })).toBeNull();
  });

  it('bounces iOS to ie.jov.jovie:// and never offers a web app continue', () => {
    const hrefWrites = setLocationOrigin('https://jov.ie');
    setPathname('/auth/ios/complete');
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `ie.jov.jovie://auth/complete?code=${CODE}&state=${STATE}`;
    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute('href', expectedDeepLink);
    expect(hrefWrites).toEqual([expectedDeepLink]);
    expect(screen.queryByRole('link', { name: /continue/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /dashboard/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /library/i })).toBeNull();
  });

  it('uses the iOS scheme on staging and local bounce origins', () => {
    setPathname('/auth/ios/complete');
    setSearchParams(`code=${CODE}&state=${STATE}`);

    setLocationOrigin('https://staging.jov.ie');
    const { unmount: unmountStaging } = render(<NativeReturnPage />);
    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute(
      'href',
      `ie.jov.jovie://auth/complete?code=${CODE}&state=${STATE}`
    );
    unmountStaging();

    setLocationOrigin('http://localhost:3112');
    render(<NativeReturnPage />);
    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute(
      'href',
      `ie.jov.jovie://auth/complete?code=${CODE}&state=${STATE}`
    );
  });

  it('treats client=ios as the iOS bounce even on the electron path', () => {
    setPathname('/auth/native-return');
    setSearchParams(`client=ios&code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute(
      'href',
      `ie.jov.jovie://auth/complete?code=${CODE}&state=${STATE}`
    );
  });
});
