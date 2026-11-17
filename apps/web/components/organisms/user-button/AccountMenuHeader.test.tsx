import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ACCOUNT_MENU_HEADER_ROW_CLASS,
  AccountMenuHeader,
  type AccountMenuHeaderProps,
} from './AccountMenuHeader';

const BASE: AccountMenuHeaderProps = {
  displayName: 'Adele Adkins',
  userInitials: 'AA',
  userImageUrl: undefined,
  formattedUsername: '@adele',
  contactEmail: 'adele@example.com',
  isPro: true,
};

function renderHeader(props: Partial<AccountMenuHeaderProps> = {}) {
  return render(
    <div className={ACCOUNT_MENU_HEADER_ROW_CLASS}>
      <AccountMenuHeader {...BASE} {...props} />
    </div>
  );
}

describe('AccountMenuHeader', () => {
  it('puts the plan badge beside the name on one centred line', async () => {
    const { container } = renderHeader();
    const name = screen.getByTitle('Adele Adkins');
    const badge = screen.getByText('Pro');
    expect(name.parentElement).toBe(badge.parentElement);
    expect(name.parentElement).toHaveClass('items-center', 'gap-1.5');
    // The name hugs its text, so the badge is not pushed to the far edge.
    expect(name).toHaveClass('truncate');
    expect(name).not.toHaveClass('flex-1');
    expect(badge).toHaveClass('shrink-0');
    await expectNoA11yViolations(container);
  });

  it('shows the handle under the name when there is one', () => {
    renderHeader();
    expect(screen.getByText('@adele')).toHaveClass(
      'truncate',
      'text-2xs',
      'text-tertiary-token'
    );
    expect(screen.queryByText('adele@example.com')).toBeNull();
  });

  it('falls back to the email when there is no handle', () => {
    renderHeader({ formattedUsername: null });
    expect(screen.getByText('adele@example.com')).toHaveAttribute(
      'title',
      'adele@example.com'
    );
  });

  it('drops the second line when there is no handle or email', () => {
    const { container } = renderHeader({
      formattedUsername: null,
      contactEmail: undefined,
    });
    expect(container.querySelector('p')).toBeNull();
    expect(container.textContent).not.toContain(' ');
  });

  it('hides the plan badge on a free plan', () => {
    renderHeader({ isPro: false });
    expect(screen.queryByText('Pro')).toBeNull();
  });

  it('keeps the avatar in the shared icon column and the row content-height', () => {
    const { container } = renderHeader();
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveClass('h-auto', 'gap-2', 'px-(--space-2-5)');
    expect(row.firstElementChild).toHaveClass(
      'w-4',
      'shrink-0',
      'justify-center'
    );
  });
});
