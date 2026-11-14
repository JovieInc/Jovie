import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsSection } from './SettingsSection';

afterEach(() => {
  delete document.documentElement.dataset.desktopRuntime;
});

it.each([false, true])(
  'renders one plain page title and the header action on desktop=%s',
  desktop => {
    if (desktop) document.documentElement.dataset.desktopRuntime = 'electron';
    const save = vi.fn();
    const { container } = render(
      <SettingsSection
        id='account'
        title='Account'
        headerAction={
          <button type='button' onClick={save}>
            Save
          </button>
        }
      >
        <p>Account controls</p>
      </SettingsSection>
    );
    const headings = screen.getAllByRole('heading', { name: 'Account' });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.tagName).toBe('H1');
    expect(headings[0]).toHaveClass(
      'text-xl',
      'font-medium',
      'text-primary-token'
    );
    expect(screen.getByText('Account controls')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledOnce();
    // Web and the Mac app render the same body: no breadcrumb header, no
    // bordered page header and no description line under the title.
    expect(screen.queryByTestId('dashboard-header')).not.toBeInTheDocument();
    expect(container.querySelector('.border-b')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    // The Mac app keeps an empty, draggable title bar strip above the title
    // so the title clears the window controls; web has no such strip.
    const titlebar = screen.queryByTestId('settings-titlebar');
    if (desktop) {
      expect(titlebar).toHaveAttribute(
        'data-top-spacing-owner',
        'shell-header'
      );
      expect(titlebar).toHaveAttribute('data-electron-drag-region', 'true');
      expect(titlebar?.textContent).toBe('');
    } else {
      expect(titlebar).not.toBeInTheDocument();
    }
  }
);

it('keeps its action within the same header row as the title', () => {
  render(
    <SettingsSection
      id='profile'
      title='Profile'
      headerAction={<button type='button'>View profile</button>}
    >
      <p>Profile controls</p>
    </SettingsSection>
  );
  const heading = screen.getByRole('heading', { name: 'Profile' });
  expect(heading.parentElement).toContainElement(
    screen.getByRole('button', { name: 'View profile' })
  );
});
