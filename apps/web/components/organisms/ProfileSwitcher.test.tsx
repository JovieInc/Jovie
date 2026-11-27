import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { IdentitySwitcher } from './ProfileSwitcher';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  data: undefined as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/components/feedback', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mocks.data,
}));
vi.mock('@/components/organisms/CreateProfileDialog', () => ({
  CreateIdentityDialog: ({ open }: { open: boolean }) =>
    open ? <p>Create identity dialog</p> : null,
}));

const alpha = {
  id: 'a',
  displayName: 'Alpha Artist',
  username: 'alpha',
  avatarUrl: null,
};
const beta = {
  id: 'b',
  displayName: 'Beta Artist',
  username: 'beta',
  avatarUrl: null,
};

describe('IdentitySwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = { identities: [alpha, beta], activeIdentity: alpha };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ success: true }) })
    );
  });

  it('renders nothing with a single identity', async () => {
    mocks.data = { identities: [alpha], activeIdentity: alpha };
    const { container } = render(<IdentitySwitcher />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('opens the menu, switches identity and refreshes the route', async () => {
    const user = userEvent.setup();
    const { container } = render(<IdentitySwitcher />);

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: /Switch identity:.*Alpha Artist/ })
    );
    await user.click(await screen.findByRole('menuitem', { name: /Beta/ }));
    expect(fetch).toHaveBeenCalledWith(
      '/api/dashboard/profile/switch',
      expect.objectContaining({ method: 'POST' })
    );
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it('reports a failed switch with a toast and does not refresh', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Not allowed' }),
      })
    );
    render(<IdentitySwitcher />);

    await user.click(screen.getByRole('button', { name: /Switch identity:/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Beta/ }));
    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Not allowed')
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('opens the create dialog from the menu', async () => {
    const user = userEvent.setup();
    render(<IdentitySwitcher />);

    await user.click(screen.getByRole('button', { name: /Switch identity:/ }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Add Artist Identity/ })
    );
    expect(await screen.findByText('Create identity dialog')).toBeVisible();
  });
});
