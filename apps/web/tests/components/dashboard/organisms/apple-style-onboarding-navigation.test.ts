import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { navigateToDashboard } from '@/features/dashboard/organisms/apple-style-onboarding/navigation';

describe('navigateToDashboard', () => {
  it('uses client-side navigation to dashboard route', () => {
    const push = vi.fn();

    navigateToDashboard({ push });

    expect(push).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });
});
