import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { PreviewDataHydrator } from './PreviewDataHydrator';

const register = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: null }),
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelData: () => ({ setPreviewData: vi.fn() }),
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
