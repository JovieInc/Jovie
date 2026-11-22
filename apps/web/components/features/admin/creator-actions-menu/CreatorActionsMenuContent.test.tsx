import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreatorActionsMenuContent } from './CreatorActionsMenuContent';

const baseProfile = {
  id: 'profile-1',
  username: 'alice',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: 'token',
} as unknown as AdminCreatorProfileRow;

function renderItem({
  children,
  disabled,
  href,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  return href ? (
    <a href={href}>{children}</a>
  ) : (
    <button type='button' disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function setup(
  overrides: Partial<Parameters<typeof CreatorActionsMenuContent>[0]> = {}
) {
  const props = {
    profile: baseProfile,
    status: 'idle' as const,
    copySuccess: false,
    onToggleVerification: vi.fn(async () => {}),
    onToggleFeatured: vi.fn(async () => {}),
    onToggleMarketing: vi.fn(async () => {}),
    onSendInvite: vi.fn(),
    onRefreshIngest: vi.fn(async () => {}),
    onDelete: vi.fn(),
    onCopyClaimLink: vi.fn(async () => {}),
    renderItem,
    renderSeparator: () => <hr />,
    ...overrides,
  };
  const view = render(<CreatorActionsMenuContent {...props} />);
  return { props, ...view };
}

describe('CreatorActionsMenuContent certificate', () => {
  it('runs every action for an unclaimed creator and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { props, container } = setup();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /Refresh ingest/ }));
    await user.click(screen.getByRole('button', { name: /Verify creator/ }));
    await user.click(screen.getByRole('button', { name: /Feature/ }));
    await user.click(screen.getByRole('button', { name: /Disable marketing/ }));
    await user.click(screen.getByRole('button', { name: /Copy claim link/ }));
    await user.click(screen.getByRole('button', { name: /Send invite/ }));
    await user.click(screen.getByRole('button', { name: /Delete creator/ }));

    expect(props.onRefreshIngest).toHaveBeenCalledOnce();
    expect(props.onToggleVerification).toHaveBeenCalledOnce();
    expect(props.onToggleFeatured).toHaveBeenCalledOnce();
    expect(props.onToggleMarketing).toHaveBeenCalledOnce();
    expect(props.onCopyClaimLink).toHaveBeenCalledOnce();
    expect(props.onSendInvite).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: /View profile/ })).toHaveAttribute(
      'href',
      '/alice'
    );
  });

  it('reflects verified, featured and claimed state', async () => {
    const { container } = setup({
      profile: {
        ...baseProfile,
        isVerified: true,
        isFeatured: true,
        marketingOptOut: true,
        isClaimed: true,
      },
      copySuccess: true,
      onRefreshIngest: undefined,
    });
    expect(
      screen.getByRole('button', { name: /Unverify creator/ })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Unfeature/ })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Enable marketing/ })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Delete user/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Copy claim link/ })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Refresh ingest/ })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('disables refresh while loading and confirms a copied claim link', async () => {
    const { container } = setup({ status: 'loading', copySuccess: true });
    expect(
      screen.getByRole('button', { name: /Refresh ingest/ })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /Copied!/ })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
