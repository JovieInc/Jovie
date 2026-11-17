import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { JoviePixel } from './JoviePixel';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  sendBeacon: vi.fn(),
}));

const pixelWindow = globalThis as typeof globalThis & {
  joviePixel?: {
    track?: (eventType: string, data?: Record<string, unknown>) => void;
  };
};

vi.mock('@/lib/queries/useTrackingMutation', () => ({
  useTrackingMutation: () => ({ mutate: mocks.mutate }),
}));

vi.mock('@/lib/tracking/consent', () => ({
  getOrCreateAcquisitionId: () => 'acq-123',
  getOrCreateSessionId: () => 'session-123',
  isTrackingAllowed: () => false,
}));

describe('JoviePixel certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mutate.mockClear();
    mocks.sendBeacon.mockReset();
    mocks.sendBeacon.mockReturnValue(false);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: mocks.sendBeacon,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete pixelWindow.joviePixel;
  });

  it('renders no markup, marks consent-less events and tracks annotated form submits', async () => {
    const { container } = render(
      <main>
        <JoviePixel profileId='profile-123' />
        <form
          aria-label='Join the list'
          data-track-form
          data-form-type='email_capture'
          onSubmit={event => event.preventDefault()}
        >
          <button type='submit'>Join</button>
        </form>
      </main>
    );

    act(() => vi.advanceTimersByTime(100));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'page_view', consent: false })
    );

    fireEvent.submit(screen.getByRole('form', { name: 'Join the list' }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: 'form_submit',
        eventData: expect.objectContaining({ formType: 'email_capture' }),
        profileId: 'profile-123',
      })
    );
    expect(container.querySelector('main')?.children).toHaveLength(1);

    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('ignores unannotated links and exposes a programmatic track hook', async () => {
    const { container } = render(
      <main>
        <JoviePixel profileId='profile-123' />
        <a href='https://example.com'>Plain link</a>
      </main>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Plain link' }));
    expect(mocks.mutate).not.toHaveBeenCalled();

    act(() => pixelWindow.joviePixel?.track?.('link_click', { linkId: 'x' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'link_click',
        eventData: expect.objectContaining({ linkId: 'x' }),
      })
    );

    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });
});
