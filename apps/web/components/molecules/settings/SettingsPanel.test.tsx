import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsGroup, SettingsPanel } from './SettingsPanel';
import { SettingsRow } from './SettingsRow';

describe('SettingsPanel', () => {
  it('renders a heading, description and working header action, axe-clean', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(
      <SettingsPanel
        title='Appearance'
        description='Theme and contrast preferences.'
        actions={
          <Button type='button' size='sm' onClick={onSave}>
            Save
          </Button>
        }
      >
        <p>Compact settings content</p>
      </SettingsPanel>
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'Appearance' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Theme and contrast preferences.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('drops the header entirely when no header slot is set', async () => {
    const { container } = render(
      <SettingsPanel bodyClassName='px-4 py-4'>
        <p>Compact settings content</p>
      </SettingsPanel>
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    const body = screen.getByText('Compact settings content').parentElement;
    expect(body).toHaveClass('px-4', 'py-4');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const description =
      'Theme, contrast and reduced-motion preferences apply to the dashboard, the public profile preview and every embedded player you open.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SettingsPanel title='المظهر' description={description}>
          <p>محتوى الإعدادات</p>
        </SettingsPanel>
      </div>
    );
    expect(screen.getByText(description)).toHaveClass('max-w-[56ch]');
    expect(screen.getByRole('heading', { name: 'المظهر' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

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

describe('SettingsGroup', () => {
  it('renders a plain heading over ONE rounded group with hairline dividers', async () => {
    const { container } = render(
      <SettingsGroup title='Appearance'>
        <SettingsRow title='Interface theme' control={<span>System</span>} />
        <SettingsRow title='High contrast' control={<span>Off</span>} />
      </SettingsGroup>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Appearance' })
    ).toHaveClass('text-sm', 'font-medium', 'text-primary-token');
    const groups = container.querySelectorAll('[data-settings-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveClass('rounded-xl', 'border', 'bg-surface-1');
    expect(groups[0]?.firstElementChild).toHaveClass(
      'divide-y',
      'divide-(--app-shell-border)'
    );
    expect(groups[0]?.querySelectorAll('[data-settings-row]')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('places one action beside the heading and keeps it working', async () => {
    const add = vi.fn();
    const { container } = render(
      <SettingsGroup
        title='Contacts'
        action={
          <button type='button' onClick={add}>
            Add Contact
          </button>
        }
      >
        <SettingsRow title='Ada Artist' description='Manager' />
      </SettingsGroup>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    expect(add).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('draws no heading row when it has neither title nor action', () => {
    const { container } = render(
      <SettingsGroup>
        <SettingsRow title='Email' />
      </SettingsGroup>
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.firstElementChild?.children).toHaveLength(1);
  });
});
