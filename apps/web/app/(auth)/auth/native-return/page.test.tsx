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

import NativeReturnPage from './page';

const CODE = '00000000000040008000000000000001';
const STATE = 'abcdef0123456789abcdef0123456789';
const FLOW = 'htmjTw7x7kSYKEPuInDfGOJ0U9q56p4Y';

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

describe('NativeReturnPage (desktop auth bounce)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom cannot navigate to a custom scheme; swallow the auto-fire assign.
    setLocationOrigin('https://jov.ie');
  });

  it('renders an Open Jovie button pointing at the jovie:// deep link', () => {
    const hrefWrites = setLocationOrigin('https://jov.ie');
    setSearchParams(`code=${CODE}&state=${STATE}&desktop_flow=${FLOW}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `jovie://auth/complete?code=${CODE}&state=${STATE}&desktop_flow=${FLOW}`;
    const link = screen.getByRole('link', { name: 'Open Jovie' });
    expect(link).toHaveAttribute('href', expectedDeepLink);
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('preserves the deep link without desktop_flow when absent', () => {
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    expect(screen.getByRole('link', { name: 'Open Jovie' })).toHaveAttribute(
      'href',
      `jovie://auth/complete?code=${CODE}&state=${STATE}`
    );
  });

  it('uses the staging app scheme on staging origin', () => {
    const hrefWrites = setLocationOrigin('https://staging.jov.ie');
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `jovie-staging://auth/complete?code=${CODE}&state=${STATE}`;
    expect(screen.getByRole('link', { name: 'Open Jovie' })).toHaveAttribute(
      'href',
      expectedDeepLink
    );
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('uses the local app scheme on localhost origin', () => {
    const hrefWrites = setLocationOrigin('http://localhost:3112');
    setSearchParams(`code=${CODE}&state=${STATE}`);
    render(<NativeReturnPage />);

    const expectedDeepLink = `jovie-local://auth/complete?code=${CODE}&state=${STATE}`;
    expect(screen.getByRole('link', { name: 'Open Jovie' })).toHaveAttribute(
      'href',
      expectedDeepLink
    );
    expect(hrefWrites).toEqual([expectedDeepLink]);
  });

  it('renders safely before browser location is available', () => {
    Reflect.deleteProperty(globalThis, 'location');
    setSearchParams(`code=${CODE}&state=${STATE}`);

    expect(() => render(<NativeReturnPage />)).not.toThrow();
    expect(screen.queryByRole('link', { name: 'Open Jovie' })).toBeNull();
  });

  it('shows a recovery message and no deep link when required params are missing', () => {
    setSearchParams(`state=${STATE}`);
    render(<NativeReturnPage />);

    expect(screen.queryByRole('link', { name: 'Open Jovie' })).toBeNull();
    expect(
      screen.getByText(/missing required information/i)
    ).toBeInTheDocument();
  });

  it('rejects a malformed exchange code (no scheme injection)', () => {
    setSearchParams(`code=jovie%3A%2F%2Fevil&state=${STATE}`);
    render(<NativeReturnPage />);

    expect(screen.queryByRole('link', { name: 'Open Jovie' })).toBeNull();
  });
});
