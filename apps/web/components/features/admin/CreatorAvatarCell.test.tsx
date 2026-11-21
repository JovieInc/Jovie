import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreatorAvatarCell } from './CreatorAvatarCell';

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const uploadAvatar = vi.hoisted(() => vi.fn());
const uploadable = vi.hoisted(() => vi.fn());

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => notifications,
}));
vi.mock('@/lib/queries', () => ({
  useAvatarUploadMutation: () => ({ mutateAsync: uploadAvatar }),
}));
vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: (props: {
    src: string | null;
    alt: string;
    verified?: boolean;
    onUpload: (file: File) => Promise<string>;
    onError: (message: string) => void;
  }) => {
    uploadable(props);
    return (
      <div
        data-testid='avatar'
        data-alt={props.alt}
        data-verified={props.verified}
      >
        <button
          type='button'
          onClick={() => void props.onUpload(new File(['x'], 'a.png'))}
        >
          Upload
        </button>
        <button type='button' onClick={() => props.onError('')}>
          Fail
        </button>
      </div>
    );
  },
}));

describe('CreatorAvatarCell', () => {
  it('renders the avatar with an alt label and no star by default', async () => {
    const { container } = render(
      <CreatorAvatarCell profileId='p1' username='alice' avatarUrl={null} />
    );
    expect(screen.getByTestId('avatar')).toHaveAttribute(
      'data-alt',
      'Avatar for @alice'
    );
    expect(container.querySelector('svg')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('marks a featured creator with a token-coloured star', async () => {
    const { container } = render(
      <CreatorAvatarCell
        profileId='p1'
        username='alice'
        avatarUrl={null}
        isFeatured
        verified
      />
    );
    expect(container.querySelector('svg')).toHaveClass('text-warning');
    expect(screen.getByTestId('avatar')).toHaveAttribute(
      'data-verified',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('uploads through the mutation and reports success or failure', async () => {
    uploadAvatar.mockImplementation(async (_vars, opts) => {
      opts.onSuccess('blob:new');
      return 'blob:new';
    });
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <CreatorAvatarCell profileId='p1' username='alice' avatarUrl='a.png' />
    );
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(uploadAvatar).toHaveBeenCalledOnce();
    expect(notifications.success).toHaveBeenCalledWith('Avatar updated');

    await user.click(screen.getByRole('button', { name: 'Fail' }));
    expect(notifications.error).toHaveBeenCalledWith(
      'Failed to upload avatar. Please try again.'
    );
  });
});
