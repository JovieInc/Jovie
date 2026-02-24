import { describe, expect, it, vi } from 'vitest';
import { navigateToDashboard } from '@/components/dashboard/organisms/apple-style-onboarding/navigation';
import { APP_ROUTES } from '@/constants/routes';

describe('navigateToDashboard', () => {
  it('uses client-side navigation to dashboard route', () => {
    const push = vi.fn();

    navigateToDashboard({ push });

    expect(push).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });
});
