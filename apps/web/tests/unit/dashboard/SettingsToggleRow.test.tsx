import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';

describe('SettingsToggleRow', () => {
  it('retains compact title typography alongside semantic color classes', () => {
    render(
      <SettingsToggleRow
        title='High Contrast'
        description='Increase contrast for text, borders, and surfaces.'
        checked={false}
        onCheckedChange={vi.fn()}
        ariaLabel='Toggle high contrast mode'
      />
    );

    expect(screen.getByRole('heading', { name: 'High Contrast' })).toHaveClass(
      'text-app',
      'text-primary-token'
    );
  });

  it('dims disabled interactive rows while keeping the switch labeled by the row title', () => {
    render(
      <SettingsToggleRow
        icon={<span data-testid='row-icon'>C</span>}
        title='High Contrast'
        description='Increase contrast for text, borders, and surfaces.'
        checked={false}
        onCheckedChange={vi.fn()}
        disabled
        ariaLabel='Toggle high contrast mode'
      />
    );

    const heading = screen.getByRole('heading', { name: 'High Contrast' });
    const row = heading.closest('[data-state="disabled"]');

    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(heading).toHaveClass('text-(--color-text-disabled-token)');
    expect(
      screen.getByText('Increase contrast for text, borders, and surfaces.')
    ).toHaveClass('text-quaternary-token');
    expect(screen.getByTestId('row-icon').parentElement).toHaveClass(
      'text-(--color-text-disabled-token)'
    );
    expect(
      screen.getByRole('switch', { name: 'High Contrast' })
    ).toBeDisabled();
  });
});
