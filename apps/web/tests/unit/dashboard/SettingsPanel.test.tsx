import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';

describe('SettingsPanel', () => {
  it('renders a shared heading block above the settings card', () => {
    render(
      <SettingsPanel
        title='Appearance'
        description='Theme and contrast preferences for your workspace.'
        actions={<button type='button'>Save</button>}
      >
        <div>Panel body</div>
      </SettingsPanel>
    );

    expect(screen.getByRole('heading', { name: 'Appearance' })).toHaveClass(
      'text-app',
      'text-primary-token'
    );
    expect(
      screen.getByText('Theme and contrast preferences for your workspace.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByText('Panel body')).toBeInTheDocument();
  });

  it('owns an optional body wrapper without changing the default contract', () => {
    const { rerender } = render(
      <SettingsPanel bodyClassName='px-4 py-4 sm:px-5'>
        <span>Inset body</span>
      </SettingsPanel>
    );

    expect(screen.getByText('Inset body').parentElement).toHaveClass(
      'px-4',
      'py-4',
      'sm:px-5'
    );

    rerender(
      <SettingsPanel>
        <span>Direct body</span>
      </SettingsPanel>
    );

    expect(screen.getByText('Direct body').parentElement).toHaveClass(
      'rounded-xl',
      'border',
      'bg-surface-1'
    );
  });
});
