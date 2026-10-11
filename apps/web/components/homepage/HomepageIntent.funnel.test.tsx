import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { forwardAnalyticsEventToFunnel } from '@/lib/analytics/signup-funnel-client';

const { push, assign, postJsonBeacon, legacyTrack } = vi.hoisted(() => ({
  push: vi.fn(),
  assign: vi.fn(),
  postJsonBeacon: vi.fn(),
  legacyTrack: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon }));
vi.mock('@/lib/analytics', () => {
  return {
    track: (event: string, properties?: Record<string, unknown>) => {
      legacyTrack(event, properties);
      forwardAnalyticsEventToFunnel(event, properties);
    },
  };
});

import { SignupFunnelBeacon } from '@/components/features/tracking/SignupFunnelBeacon';
// Keep the real lazy homepage analytics and first-party funnel adapter.
import { HomepageIntent } from './HomepageIntent';
import * as homepageAnalytics from './homepage-analytics';

const CTA = { funnel: 'artist_signup', step: 'cta_click', surface: 'homepage' };

function renderHomepage(desktop = true) {
  const actualWindow = globalThis.window;
  vi.spyOn(actualWindow, 'matchMedia').mockReturnValue({
    matches: desktop,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  if (!desktop) {
    vi.stubGlobal(
      'window',
      new Proxy(actualWindow, {
        get(target, property) {
          if (property === 'location') return { assign };
          return Reflect.get(target, property);
        },
      })
    );
  }
  render(
    <>
      <SignupFunnelBeacon surface='homepage' trackLanding={false} />
      <HomepageIntent />
      <a href={APP_ROUTES.START} onClick={event => event.preventDefault()}>
        Start link
      </a>
    </>
  );
  return screen.getByPlaceholderText('Ask Jovie...');
}

beforeEach(() => {
  push.mockReset();
  assign.mockReset();
  postJsonBeacon.mockReset();
  legacyTrack.mockReset();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});

afterEach(async () => {
  cleanup();
  // Drain pending lazy analytics before clearing the next test's spies.
  await import('@/lib/analytics');
  await Promise.resolve();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('homepage primary CTA funnel', () => {
  it.each([
    { desktop: true, enter: false },
    { desktop: true, enter: true },
    { desktop: false, enter: false },
    { desktop: false, enter: true },
  ])(
    'counts once before navigation (desktop=$desktop, Enter=$enter)',
    async ({ desktop, enter }) => {
      const eventSpy = vi.spyOn(homepageAnalytics, 'trackHomepageEvent');
      const input = renderHomepage(desktop);
      const user = userEvent.setup();
      const navigate = desktop ? push : assign;
      let submittedAnalyticsAtNavigation = false;
      navigate.mockImplementation(() => {
        submittedAnalyticsAtNavigation = legacyTrack.mock.calls.some(
          call => call[0] === 'homepage_prompt_submitted'
        );
      });
      await user.type(input, 'private@example.com my private prompt');
      if (enter) await user.keyboard('{Enter}');
      else
        await user.click(screen.getByRole('button', { name: 'Submit Prompt' }));
      expect(postJsonBeacon).toHaveBeenCalledExactlyOnceWith(
        '/api/journey/step',
        CTA
      );
      expect(navigate).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('/start?intent_id=')
      );
      expect(postJsonBeacon.mock.invocationCallOrder[0]).toBeLessThan(
        navigate.mock.invocationCallOrder[0]
      );
      expect(submittedAnalyticsAtNavigation).toBe(false);

      expect(eventSpy).toHaveBeenCalledWith(
        'homepage_prompt_submitted',
        expect.any(Object)
      );
      await vi.dynamicImportSettled();
      expect(legacyTrack).toHaveBeenCalledWith(
        'homepage_prompt_submitted',
        expect.any(Object)
      );
      // The delayed generic analytics forwarder must not count the same submit again.
      expect(postJsonBeacon).toHaveBeenCalledTimes(1);
      expect(postJsonBeacon.mock.calls[0][1]).toEqual(CTA);
    }
  );

  it.each(['', '   '])('does not count an empty accepted input (%j)', value => {
    const input = renderHomepage();
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Prompt' }));
    expect(postJsonBeacon).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the delegated signup link at exactly one CTA', () => {
    renderHomepage();
    fireEvent.click(screen.getByText('Start link'));
    expect(postJsonBeacon).toHaveBeenCalledExactlyOnceWith(
      '/api/journey/step',
      CTA
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('still navigates when the first-party transport throws', () => {
    postJsonBeacon.mockImplementation(() => {
      throw new Error('blocked');
    });
    const input = renderHomepage();
    fireEvent.change(input, { target: { value: 'my profile' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('still counts and navigates when intent storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const input = renderHomepage();
    fireEvent.change(input, { target: { value: 'my profile' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postJsonBeacon).toHaveBeenCalledExactlyOnceWith(
      '/api/journey/step',
      CTA
    );
    expect(push).toHaveBeenCalledTimes(1);
  });
});
