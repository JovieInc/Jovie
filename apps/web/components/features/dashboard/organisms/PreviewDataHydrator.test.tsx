import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { PreviewDataHydrator } from './PreviewDataHydrator';

const register = vi.hoisted(() => vi.fn());
const hydration = vi.hoisted(() => ({
  setPreviewData: vi.fn(),
  selectedProfile: { username: 'alex', isVerified: true, settings: {} },
}));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: hydration.selectedProfile }),
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelData: () => ({ setPreviewData: hydration.setPreviewData }),
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: register,
}));
vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => <aside aria-label='Artist profile' />,
}));

it('registers profile-only content so the shared rail uses profile intent', () => {
  render(<PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />);
  render(register.mock.calls.at(-1)?.[0]);
  expect(
    screen.getByRole('complementary', { name: 'Artist profile' }).parentElement
  ).toHaveAttribute('data-shell-profile-only', 'true');
});

it('hydrates the profile verification flag rather than inferring it from DSP connections', () => {
  hydration.selectedProfile.isVerified = false;
  render(<PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />);
  const update = hydration.setPreviewData.mock.calls.at(-1)?.[0];
  expect(update(null)).toMatchObject({ username: 'alex', isVerified: false });
  hydration.selectedProfile.isVerified = true;
  render(<PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />);
  expect(hydration.setPreviewData.mock.calls.at(-1)?.[0](null)).toMatchObject({
    isVerified: true,
  });
});
