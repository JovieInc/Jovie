import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';

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

    expect(
      screen.getByRole('heading', { name: 'Appearance' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Theme and contrast preferences for your workspace.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByText('Panel body')).toBeInTheDocument();
  });
});
