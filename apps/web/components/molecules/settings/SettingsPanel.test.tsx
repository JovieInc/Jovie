import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsPanel } from './SettingsPanel';

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
});
