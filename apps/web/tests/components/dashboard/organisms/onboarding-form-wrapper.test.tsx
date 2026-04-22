import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingFormWrapper } from '@/features/dashboard/organisms/OnboardingFormWrapper';

const handleOnlyFormPropsSpy = vi.fn();
const v2FormPropsSpy = vi.fn();

vi.mock('@/features/dashboard/organisms/OnboardingHandleOnlyForm', () => ({
  OnboardingHandleOnlyForm: (props: {
    assumeInitialHandleAvailable?: boolean;
    initialHandle?: string;
    isHydrated?: boolean;
  }) => {
    handleOnlyFormPropsSpy(props);
    return <div data-testid='mock-onboarding-handle-only-form' />;
  },
}));

vi.mock(
  '@/features/dashboard/organisms/onboarding-v2/OnboardingV2Form',
  () => ({
    OnboardingV2Form: (props: {
      assumeInitialHandleAvailable?: boolean;
      initialHandle?: string;
    }) => {
      v2FormPropsSpy(props);
      return <div data-testid='mock-onboarding-v2-form' />;
    },
  })
);

describe('OnboardingFormWrapper', () => {
  beforeEach(() => {
    handleOnlyFormPropsSpy.mockClear();
    v2FormPropsSpy.mockClear();
  });

  it('passes through an empty handle when the server did not provide one', () => {
    render(<OnboardingFormWrapper userId='user_123' />);

    expect(handleOnlyFormPropsSpy.mock.calls[0]?.[0]).toMatchObject({
      initialHandle: '',
      isHydrated: false,
    });
    expect(v2FormPropsSpy).not.toHaveBeenCalled();
  });

  it('prefers the server-provided handle', async () => {
    render(
      <OnboardingFormWrapper initialHandle='serverhandle' userId='user_123' />
    );

    await waitFor(() => {
      expect(handleOnlyFormPropsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          initialHandle: 'serverhandle',
          isHydrated: true,
        })
      );
    });
    expect(v2FormPropsSpy).not.toHaveBeenCalled();
  });

  it('passes through seeded-handle fast-path props to the handle-only form', () => {
    render(
      <OnboardingFormWrapper
        assumeInitialHandleAvailable
        initialHandle='serverhandle'
        userId='user_123'
      />
    );

    expect(handleOnlyFormPropsSpy.mock.calls[0]?.[0]).toMatchObject({
      assumeInitialHandleAvailable: true,
      initialHandle: 'serverhandle',
    });
  });

  it('renders the full onboarding form for existing profiles without a resume param', async () => {
    render(
      <OnboardingFormWrapper
        initialHandle='existing-handle'
        initialProfileId='profile_123'
        userId='user_123'
      />
    );

    expect(handleOnlyFormPropsSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('onboarding-loading-shell')).toBeTruthy();
    expect(await screen.findByTestId('mock-onboarding-v2-form')).toBeTruthy();
  });

  it('passes seeded-handle fast-path props to the full onboarding form', async () => {
    render(
      <OnboardingFormWrapper
        assumeInitialHandleAvailable
        initialHandle='existing-handle'
        initialProfileId='profile_123'
        userId='user_123'
      />
    );

    await screen.findByTestId('mock-onboarding-v2-form');

    expect(v2FormPropsSpy.mock.calls[0]?.[0]).toMatchObject({
      assumeInitialHandleAvailable: true,
      initialHandle: 'existing-handle',
    });
  });
});
