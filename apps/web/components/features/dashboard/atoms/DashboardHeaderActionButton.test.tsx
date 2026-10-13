import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('renders a labelled action that forwards clicks and pressed state', () => {
    const onClick = vi.fn();
    render(
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
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders an icon-only action at 32px', () => {
    render(
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
  });
});
