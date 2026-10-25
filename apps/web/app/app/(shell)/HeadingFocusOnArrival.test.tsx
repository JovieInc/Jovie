import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeadingFocusOnArrival } from './HeadingFocusOnArrival';

const { replaceMock, searchParamsMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/presence',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsMock(),
}));

describe('HeadingFocusOnArrival', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
    document.body.innerHTML = '<main><h1>Artist Visibility</h1></main>';
    // rAF fires synchronously so arrival focus is deterministic in jsdom.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 0;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('focuses the landing feature heading when focus=heading is present', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('focus=heading'));
    render(<HeadingFocusOnArrival />);

    const heading = document.querySelector('h1') as HTMLElement;
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
  });

  it('strips the marker from the URL after consuming it', () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams('focus=heading&panel=profile')
    );
    render(<HeadingFocusOnArrival />);

    expect(replaceMock).toHaveBeenCalledWith('/app/presence?panel=profile', {
      scroll: false,
    });
  });

  it('does nothing without the marker', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('panel=profile'));
    render(<HeadingFocusOnArrival />);

    expect(replaceMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});
