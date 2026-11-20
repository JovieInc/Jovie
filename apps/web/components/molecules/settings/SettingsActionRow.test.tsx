import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsActionRow } from './SettingsActionRow';

describe('SettingsActionRow', () => {
  it('renders an idle row whose action fires, axe-clean', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const { container } = render(
      <SettingsActionRow
        icon={<span aria-hidden='true'>D</span>}
        title='Export Data'
        description='Download a portable copy of your account.'
        action={
          <Button type='button' size='sm' onClick={onExport}>
            Export Data
          </Button>
        }
      />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute('data-state', 'idle');
    expect(row).toHaveAttribute('data-tone', 'default');
    expect(row).not.toHaveAttribute('aria-disabled');
    await user.click(screen.getByRole('button', { name: 'Export Data' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders only the title when the optional slots are omitted', async () => {
    const { container } = render(<SettingsActionRow title='Export Data' />);
    expect(screen.getByText('Export Data')).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks a disabled destructive row', async () => {
    const { container } = render(
      <SettingsActionRow
        title='Delete Account'
        description='Publish your profile to enable this setting.'
        tone='destructive'
        disabled
      />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute('data-state', 'disabled');
    expect(row).toHaveAttribute('data-tone', 'destructive');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const description =
      'Download a portable copy of your profile, every smart link and its click history, all contacts and fan emails, release metadata and payout settings.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SettingsActionRow title='تصدير البيانات' description={description} />
      </div>
    );
    expect(screen.getByText(description)).toHaveClass('max-w-[56ch]');
    expect(screen.getByText('تصدير البيانات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
