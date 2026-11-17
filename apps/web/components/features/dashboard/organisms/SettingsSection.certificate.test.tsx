import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsSection } from './SettingsSection';

afterEach(() => {
  delete document.documentElement.dataset.desktopRuntime;
});

describe('SettingsSection certificate', () => {
  it.each([false, true])(
    'labels the region by its title and runs the header action on desktop=%s',
    async desktop => {
      if (desktop) document.documentElement.dataset.desktopRuntime = 'electron';
      const user = userEvent.setup();
      const save = vi.fn();
      const { container } = render(
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

      expect(screen.getByRole('region', { name: 'Account' })).toHaveAttribute(
        'id',
        'account'
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(save).toHaveBeenCalledOnce();
      await expectNoA11yViolations(container);
    }
  );

  it('renders a partial section without a description', async () => {
    const { container } = render(
      <SettingsSection id='privacy' title='Privacy'>
        <p>Privacy controls</p>
      </SettingsSection>
    );
    expect(
      screen.getByRole('heading', { name: 'Privacy' })
    ).toBeInTheDocument();
    expect(screen.getByText('Privacy controls')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long header and an RTL header accessible', async () => {
    const longTitle =
      'Audience verification, double opt-in confirmation and fan tracking preferences';
    const long = render(
      <SettingsSection id='long' title={longTitle} description={longTitle}>
        <p>Body</p>
      </SettingsSection>
    );
    expect(
      screen.getByRole('heading', { name: longTitle })
    ).toBeInTheDocument();
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = render(
      <div dir='rtl'>
        <SettingsSection id='rtl' title='الجمهور والتتبع'>
          <p>محتوى</p>
        </SettingsSection>
      </div>
    );
    expect(
      screen.getByRole('region', { name: 'الجمهور والتتبع' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
