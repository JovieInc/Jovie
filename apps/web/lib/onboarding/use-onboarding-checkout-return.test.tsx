import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { useOnboardingCheckoutReturn } from '@/lib/onboarding/use-onboarding-checkout-return';

const mockReplace = vi.fn();
const mockSuccess = vi.fn();
const mockInfo = vi.fn();
let mockParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockParams,
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: mockSuccess,
    info: mockInfo,
    error: vi.fn(),
  }),
}));

function Harness({ pathname }: { readonly pathname: string }) {
  useOnboardingCheckoutReturn(pathname);
  return null;
}

describe('useOnboardingCheckoutReturn', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSuccess.mockReset();
    mockInfo.mockReset();
    mockParams = new URLSearchParams();
  });

  it('toasts success and strips checkout return params', () => {
    mockParams = new URLSearchParams(
      'from=onboarding&panel=profile&upgrade=success&session_id=cs_test&plan_id=pro'
    );

    render(<Harness pathname={APP_ROUTES.CHAT} />);

    expect(mockSuccess).toHaveBeenCalledWith('Upgrade complete.');
    expect(mockReplace).toHaveBeenCalledWith(
      `${APP_ROUTES.CHAT}?from=onboarding&panel=profile`,
      { scroll: false }
    );
  });

  it('toasts cancel and strips checkout return params', () => {
    mockParams = new URLSearchParams(
      'from=onboarding&panel=profile&upgrade=cancel'
    );

    render(<Harness pathname={APP_ROUTES.CHAT} />);

    expect(mockInfo).toHaveBeenCalledWith(
      'Checkout cancelled. You can keep going for free.'
    );
    expect(mockReplace).toHaveBeenCalledWith(
      `${APP_ROUTES.CHAT}?from=onboarding&panel=profile`,
      { scroll: false }
    );
  });

  it('no-ops when upgrade is absent', () => {
    mockParams = new URLSearchParams('from=onboarding&panel=profile');

    render(<Harness pathname={APP_ROUTES.CHAT} />);

    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
