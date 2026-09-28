import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreserveSearchRedirect } from './PreserveSearchRedirect';

describe('<PreserveSearchRedirect>', () => {
  const originalLocation = globalThis.location;
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceMock = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      value: {
        origin: 'https://jov.ie',
        pathname: '/artist/old-track-slug',
        search: '?utm_source=email&dsp=spotify',
        hash: '',
        replace: replaceMock,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders a stable, non-blank redirect state instead of nothing (JOV-6456)', () => {
    const { container } = render(
      <PreserveSearchRedirect href='/artist/release-slug/old-track-slug' />
    );

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('redirects to the target href while preserving the current search string', () => {
    render(
      <PreserveSearchRedirect href='/artist/release-slug/old-track-slug' />
    );

    expect(replaceMock).toHaveBeenCalledWith(
      'https://jov.ie/artist/release-slug/old-track-slug?utm_source=email&dsp=spotify'
    );
  });

  it('does not redirect when already on the target URL', () => {
    Object.defineProperty(globalThis, 'location', {
      value: {
        origin: 'https://jov.ie',
        pathname: '/artist/release-slug/old-track-slug',
        search: '?utm_source=email&dsp=spotify',
        hash: '',
        replace: replaceMock,
      },
      writable: true,
      configurable: true,
    });

    render(
      <PreserveSearchRedirect href='/artist/release-slug/old-track-slug' />
    );

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
