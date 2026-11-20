import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS,
  DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS,
  DashboardHeaderActionButton,
} from './DashboardHeaderActionButton';

const icon = <svg data-testid='action-icon' />;

describe('DashboardHeaderActionButton', () => {
  it('locks the text button to the 32px desktop density contract', () => {
    expect(DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS).toContain('h-8');
    expect(DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS).not.toContain('h-7');
  });

  it('keeps the canonical hit target instead of restyling icon height', () => {
    expect(DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS).not.toMatch(
      /(^|\s)(sm:before:)?[hw]-\d/
    );
  });

  it('keeps a labelled action keyboard-operable with its pressed state', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <DashboardHeaderActionButton
        ariaLabel='Refresh'
        icon={icon}
        label='Refresh'
        onClick={onClick}
        pressed
      />
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).toContain('h-8');
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    expect(button).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders an icon-only action at 32px', async () => {
    const { container } = render(
      <DashboardHeaderActionButton
        ariaLabel='Copy'
        icon={icon}
        iconOnly
        dataTestId='copy-action'
      />
    );

    const button = screen.getByTestId('copy-action');
    expect(button).toHaveAttribute('aria-label', 'Copy');
    // md IconButton size = 32px face; the 44px pseudo hit target stays.
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('w-8');
    expect(button.className).toContain('before:h-11');
    await expectNoA11yViolations(container);
  });

  it('falls back to the icon button when no label is passed', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <DashboardHeaderActionButton
        ariaLabel='Toggle details sidebar'
        icon={icon}
        onClick={onClick}
        dataTestId='details-action'
      />
    );

    const button = screen.getByRole('button', {
      name: 'Toggle details sidebar',
    });
    expect(button).toHaveAttribute('data-testid', 'details-action');
    expect(button.className).toContain('w-8');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps a disabled action named and inert', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <DashboardHeaderActionButton
        ariaLabel='Copy'
        icon={icon}
        iconOnly
        disabled
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Copy' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a long label whole and works in a right-to-left header', async () => {
    const { container } = render(
      <div>
        <DashboardHeaderActionButton
          ariaLabel='Open notification and delivery settings'
          icon={icon}
          label='Open notification and delivery settings'
        />
        <div dir='rtl' lang='ar'>
          <DashboardHeaderActionButton
            ariaLabel='فتح الإعدادات'
            icon={icon}
            label='الإعدادات'
            hideLabelOnMobile
          />
        </div>
      </div>
    );

    expect(
      screen.getByText('Open notification and delivery settings')
    ).toBeInTheDocument();
    expect(screen.getByText('الإعدادات')).toHaveClass('max-sm:hidden');
    expect(
      screen.getByRole('button', { name: 'فتح الإعدادات' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
