import { Input } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerFormField } from './DrawerFormField';

describe('DrawerFormField certificate', () => {
  it('focuses the control from its label and keeps typed text, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DrawerFormField
        label='Profile URL'
        htmlFor='profile-url'
        helperText='Use the public URL customers already know.'
      >
        <Input id='profile-url' defaultValue='' />
      </DrawerFormField>
    );

    await user.click(screen.getByText('Profile URL'));
    const field = screen.getByLabelText('Profile URL');
    expect(field).toHaveFocus();
    await user.type(field, 'jov.ie/tim');
    expect(field).toHaveValue('jov.ie/tim');
    await expectNoA11yViolations(container);
  });

  it('omits the helper line when there is none (partial)', async () => {
    const { container } = render(
      <DrawerFormField label='Display name' htmlFor='display-name'>
        <Input id='display-name' defaultValue='Tim White' />
      </DrawerFormField>
    );

    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByLabelText('Display name')).toHaveValue('Tim White');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy whole and axe-clean', async () => {
    const helper =
      'Changing this URL breaks every link already shared on social posts, press kits and playlists.';
    const { container } = render(
      <div dir='rtl'>
        <DrawerFormField
          label='رابط الملف الشخصي'
          htmlFor='rtl-url'
          helperText={helper}
        >
          <Input id='rtl-url' defaultValue='jov.ie/amr' />
        </DrawerFormField>
      </div>
    );

    expect(screen.getByLabelText('رابط الملف الشخصي')).toHaveValue(
      'jov.ie/amr'
    );
    expect(screen.getByText(helper)).toHaveClass('text-tertiary-token');
    await expectNoA11yViolations(container);
  });
});
