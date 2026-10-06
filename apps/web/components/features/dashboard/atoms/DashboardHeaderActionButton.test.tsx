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
    expect(DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS).toContain(
      'sm:before:min-h-8'
    );
  });

  it('locks the icon button to 32px with a desktop-collapsed hit target', () => {
    expect(DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS).toContain('h-8');
    expect(DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS).toContain('w-8');
    expect(DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS).toContain(
      'sm:before:h-8'
    );
    expect(DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS).toContain(
      'sm:before:w-8'
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
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('w-8');
  });
});
