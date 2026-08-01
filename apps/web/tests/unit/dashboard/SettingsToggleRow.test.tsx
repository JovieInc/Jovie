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
});
