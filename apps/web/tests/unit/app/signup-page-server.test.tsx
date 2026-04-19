import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOperationalControlsMock, noStoreMock } = vi.hoisted(() => ({
  getOperationalControlsMock: vi.fn(),
  noStoreMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_noStore: noStoreMock,
}));

vi.mock('@/components/UnavailablePage', () => ({
  UnavailablePage: () => <div data-testid='unavailable-page' />,
}));

vi.mock('@/lib/admin/operational-controls', () => ({
  getOperationalControls: getOperationalControlsMock,
}));

vi.mock('../../../app/(auth)/signup/SignUpPageClient', () => ({
  SignUpPageClient: () => <div data-testid='signup-page-client' />,
}));

import SignUpPage from '../../../app/(auth)/signup/page';

describe('signup page server wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOperationalControlsMock.mockResolvedValue({
      signupEnabled: true,
    });
  });

  it('renders the signup client when signup is enabled', async () => {
    render(await SignUpPage());

    expect(noStoreMock).toHaveBeenCalledTimes(1);
    expect(getOperationalControlsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('signup-page-client')).toBeInTheDocument();
    expect(screen.queryByTestId('unavailable-page')).not.toBeInTheDocument();
  });

  it('renders the unavailable page when signup is disabled', async () => {
    getOperationalControlsMock.mockResolvedValueOnce({
      signupEnabled: false,
    });

    render(await SignUpPage());

    expect(screen.getByTestId('unavailable-page')).toBeInTheDocument();
    expect(screen.queryByTestId('signup-page-client')).not.toBeInTheDocument();
  });
});
