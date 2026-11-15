import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WrappedLinkMissingState } from './WrappedLinkMissingState';

describe('WrappedLinkMissingState certificate', () => {
  it('renders the recovery card axe-clean with one home link', async () => {
    const { container } = render(<WrappedLinkMissingState />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Link Not Found' })
    ).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Return Home' })).toHaveAttribute(
      'href',
      '/'
    );
    await expectNoA11yViolations(container);
  });

  it('moves keyboard focus to the home link', async () => {
    const user = userEvent.setup();
    render(<WrappedLinkMissingState />);

    await user.tab();

    expect(screen.getByRole('link', { name: 'Return Home' })).toHaveFocus();
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <WrappedLinkMissingState />
      </div>
    );

    expect(screen.getByTestId('not-found')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
