import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ACCOUNT_LOADING_FILL } from './account-loading-fill';
import {
  BillingLoadingRow,
  UserButtonLoadingPlaceholder,
  UserButtonTriggerAvatar,
} from './UserButtonLoading';

/** The placeholder itself when it is a fill, plus every fill inside it. */
function fillsOf(element: HTMLElement): Element[] {
  return [
    ...(element.matches('[data-user-button-loading-fill]') ? [element] : []),
    ...element.querySelectorAll('[data-user-button-loading-fill]'),
  ];
}

describe('UserButtonLoadingPlaceholder', () => {
  it.each([
    [true, 'rounded-md', 2],
    [false, 'rounded-full', 1],
  ])(
    'draws the showUserInfo %s shape with the visible fill',
    async (showUserInfo, shape, fillCount) => {
      const { container } = render(
        <UserButtonLoadingPlaceholder showUserInfo={showUserInfo} calm />
      );

      const loading = screen.getByTestId('user-button-loading');
      expect(loading).toHaveClass(shape);
      // JOV-12383: every placeholder uses the fill that clears 3:1 on the
      // light surface; the invisible legacy fills are gone.
      const fills = fillsOf(loading);
      expect(fills).toHaveLength(fillCount);
      for (const fill of fills) {
        expect(fill).toHaveClass(ACCOUNT_LOADING_FILL);
        expect(fill).not.toHaveClass('bg-sidebar-accent');
        expect(fill).not.toHaveClass('bg-surface-2');
      }
      await expectNoA11yViolations(container);
    }
  );

  it('keeps the compact row at 32px only when calm', () => {
    const { rerender } = render(
      <UserButtonLoadingPlaceholder showUserInfo calm />
    );
    expect(screen.getByTestId('user-button-loading')).toHaveClass('h-8');

    rerender(<UserButtonLoadingPlaceholder showUserInfo calm={false} />);
    expect(screen.getByTestId('user-button-loading')).not.toHaveClass('h-8');
  });
});

describe('BillingLoadingRow', () => {
  it('fills the icon column and the label with the visible fill', () => {
    render(<BillingLoadingRow />);

    const row = screen.getByTestId('billing-loading');
    const selector = `.${ACCOUNT_LOADING_FILL.replace('/', '\\/')}`;
    expect(row.querySelectorAll(selector)).toHaveLength(2);
  });
});

describe('UserButtonTriggerAvatar', () => {
  it('puts the avatar on the icon column only in the compact row', () => {
    const { container, rerender } = render(
      <UserButtonTriggerAvatar calm src={undefined} name='Adele' alt='Adele' />
    );
    expect(
      container.querySelector('[data-user-button-icon-column]')
    ).not.toBeNull();

    rerender(
      <UserButtonTriggerAvatar
        calm={false}
        src={undefined}
        name='Adele'
        alt='Adele'
      />
    );
    expect(
      container.querySelector('[data-user-button-icon-column]')
    ).toBeNull();
  });
});
