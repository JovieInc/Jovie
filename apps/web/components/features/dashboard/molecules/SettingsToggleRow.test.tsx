import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsToggleRow } from './SettingsToggleRow';

function ControlledRow({
  onCheckedChange,
}: Readonly<{ onCheckedChange: (checked: boolean) => void }>) {
  const [checked, setChecked] = useState(false);
  return (
    <SettingsToggleRow
      title='Email notifications'
      description='Get an email when a fan subscribes.'
      ariaLabel='Email notifications'
      checked={checked}
      onCheckedChange={next => {
        onCheckedChange(next);
        setChecked(next);
      }}
    />
  );
}

// The dashboard path re-exports the shared settings row; this proves the
// re-export resolves to the interactive and gated row.
describe('SettingsToggleRow (dashboard re-export)', () => {
  it('toggles the switch and reports the next value', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { container } = render(
      <ControlledRow onCheckedChange={onCheckedChange} />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAccessibleName('Email notifications');
    expect(toggle).toHaveAccessibleDescription(
      'Get an email when a fan subscribes.'
    );
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('ignores presses while busy or disabled', async () => {
    const user = userEvent.setup();
    const onBusy = vi.fn();
    const onDisabled = vi.fn();
    const { container } = render(
      <>
        <SettingsToggleRow
          title='Busy row'
          ariaLabel='Busy row'
          checked
          busy
          onCheckedChange={onBusy}
        />
        <SettingsToggleRow
          title='Disabled row'
          ariaLabel='Disabled row'
          checked={false}
          disabled
          onCheckedChange={onDisabled}
        />
      </>
    );

    const [busy, disabled] = screen.getAllByRole('switch');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(disabled).toBeDisabled();
    await user.click(busy);
    await user.click(disabled);
    expect(onBusy).not.toHaveBeenCalled();
    expect(onDisabled).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the plan gate instead of a switch when gated', async () => {
    const { container } = render(
      <TooltipProvider>
        <SettingsToggleRow
          gated
          title='Remove Jovie branding'
          description='Hide the Jovie footer on your profile.'
          gatePlanName='Pro'
        />
      </TooltipProvider>
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Pro');
    expect(
      screen.getByRole('heading', { name: 'Remove Jovie branding' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SettingsToggleRow
          title='إشعارات البريد'
          ariaLabel='إشعارات البريد'
          checked={false}
          onCheckedChange={vi.fn()}
        />
      </div>
    );

    expect(screen.getByRole('switch')).toHaveAccessibleName('إشعارات البريد');
    await expectNoA11yViolations(container);
  });
});
