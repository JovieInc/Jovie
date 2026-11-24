import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarUploadable } from './AvatarUploadable';

describe('AvatarUploadable', () => {
  it('has no axe violations when read-only and uploadable', async () => {
    const { container, rerender } = render(
      <AvatarUploadable
        name='Jordan'
        alt='Jordan'
        src={null}
        uploadable={false}
      />
    );
    await expectNoA11yViolations(container);

    rerender(
      <AvatarUploadable
        name='Jordan'
        alt='Jordan'
        src={null}
        uploadable
        onUpload={async () => 'https://example.com/a.jpg'}
      />
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const { container } = render(
      <div dir='rtl' className='w-32'>
        <AvatarUploadable
          name='فنان طويل الاسم جداً للموسيقى التجريبية'
          alt='صورة فنان طويل الاسم جداً للموسيقى التجريبية'
          src={null}
          uploadable
          onUpload={async () => 'https://example.com/a.jpg'}
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('opens the file picker when the upload surface is activated', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(async () => 'https://example.com/a.jpg');
    render(
      <AvatarUploadable
        name='Jordan'
        alt='Jordan'
        src={null}
        uploadable
        onUpload={onUpload}
      />
    );

    const fileInput = screen.getByLabelText(
      'Choose Profile Photo File'
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    await user.click(
      screen.getByRole('button', { name: /Upload profile photo/i })
    );
    expect(clickSpy).toHaveBeenCalled();
  });

  it('uploads a chosen file and announces success via onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onUpload = vi.fn(async () => 'https://example.com/new.jpg');
    render(
      <AvatarUploadable
        name='Jordan'
        alt='Jordan'
        src={null}
        uploadable
        onUpload={onUpload}
        onSuccess={onSuccess}
      />
    );

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    const input = screen.getByLabelText('Choose Profile Photo File');
    await user.upload(input, file);

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith(file);
      expect(onSuccess).toHaveBeenCalledWith('https://example.com/new.jpg');
    });
  });

  it('stays non-interactive when uploadable is false', () => {
    render(
      <AvatarUploadable
        name='Jordan'
        alt='Jordan'
        src={null}
        uploadable={false}
      />
    );
    expect(screen.queryByLabelText('Choose Profile Photo File')).toBeNull();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
