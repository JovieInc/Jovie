import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingFormWrapper } from '@/features/dashboard/organisms/OnboardingFormWrapper';

const formPropsSpy = vi.fn();

vi.mock(
  '@/features/dashboard/organisms/onboarding-v2/OnboardingV2Form',
  () => ({
    OnboardingV2Form: (props: { initialHandle?: string }) => {
      formPropsSpy(props);
      return <div data-testid='mock-onboarding-form' />;
    },
  })
);

describe('OnboardingFormWrapper', () => {
  beforeEach(() => {
    formPropsSpy.mockClear();
    globalThis.sessionStorage.clear();
  });

  it('resolves pending claim handles synchronously on first render', () => {
    globalThis.sessionStorage.setItem(
      'pendingClaim',
      JSON.stringify({ handle: 'claimedhandle', ts: Date.now() })
    );

    render(<OnboardingFormWrapper userId='user_123' />);

    // The handle is resolved eagerly in the useState initializer to avoid
    // a key-change remount that would cause visible layout shift.
    expect(formPropsSpy).toHaveBeenCalledTimes(1);
    expect(formPropsSpy.mock.calls[0]?.[0]).toMatchObject({
      initialHandle: 'claimedhandle',
    });

    expect(globalThis.sessionStorage.getItem('pendingClaim')).toBeNull();
  });

  it('prefers the server-provided handle and leaves pending claims untouched', () => {
    globalThis.sessionStorage.setItem(
      'pendingClaim',
      JSON.stringify({ handle: 'claimedhandle', ts: Date.now() })
    );

    render(
      <OnboardingFormWrapper initialHandle='serverhandle' userId='user_123' />
    );

    expect(formPropsSpy).toHaveBeenCalledTimes(1);
    expect(formPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialHandle: 'serverhandle',
      })
    );
    expect(globalThis.sessionStorage.getItem('pendingClaim')).not.toBeNull();
  });
});
