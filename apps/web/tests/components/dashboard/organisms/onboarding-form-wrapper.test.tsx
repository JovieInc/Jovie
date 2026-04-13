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
  });

  it('passes through an empty handle when the server did not provide one', () => {
    render(<OnboardingFormWrapper userId='user_123' />);

    expect(formPropsSpy.mock.calls[0]?.[0]).toMatchObject({
      initialHandle: '',
    });
  });

  it('prefers the server-provided handle', () => {
    render(
      <OnboardingFormWrapper initialHandle='serverhandle' userId='user_123' />
    );

    expect(formPropsSpy.mock.calls[0]?.[0]).toMatchObject({
      initialHandle: 'serverhandle',
    });
  });
});
