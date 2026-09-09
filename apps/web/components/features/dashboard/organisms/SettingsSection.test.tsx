import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsSection } from './SettingsSection';

afterEach(() => {
  delete document.documentElement.dataset.desktopRuntime;
});

it.each([
  false,
  true,
])('preserves a single title, description and header action on desktop=%s', desktop => {
  if (desktop) document.documentElement.dataset.desktopRuntime = 'electron';
  const save = vi.fn();
  render(
    <SettingsSection
      id='account'
      title='Account'
      description='Security and theme'
      headerAction={
        <button type='button' onClick={save}>
          Save
        </button>
      }
    >
      <p>Account controls</p>
    </SettingsSection>
  );
  expect(screen.getAllByRole('heading', { name: 'Account' })).toHaveLength(1);
  expect(screen.getByText('Security and theme')).toBeVisible();
  expect(screen.getByText('Account controls')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(save).toHaveBeenCalledOnce();
  if (desktop)
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
  else expect(screen.queryByTestId('dashboard-header')).not.toBeInTheDocument();
});
