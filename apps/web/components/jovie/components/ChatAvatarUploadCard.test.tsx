import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatAvatarUploadCard } from './ChatAvatarUploadCard';

const mocks = vi.hoisted(() => ({
  profileId: 'profile-1' as string | null,
  mutate: vi.fn(),
  onSuccess: null as ((url: string) => void) | null,
  onError: null as ((err: Error) => void) | null,
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: mocks.profileId ? { id: mocks.profileId } : null,
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelContext: () => null,
}));

vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useAvatarMutation: (options: {
    readonly onSuccess?: (url: string) => void;
    readonly onError?: (err: Error) => void;
  }) => {
    mocks.onSuccess = options.onSuccess ?? null;
    mocks.onError = options.onError ?? null;
    return { mutate: mocks.mutate };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileId = 'profile-1';
  mocks.onSuccess = null;
  mocks.onError = null;
});

describe('ChatAvatarUploadCard', () => {
  it('has no axe violations in idle, error, and RTL frames', async () => {
    const { container, rerender } = render(<ChatAvatarUploadCard />);
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    mocks.mutate.mockImplementation(() => {
      mocks.onError?.(new Error('Upload failed — try again'));
    });
    await user.upload(
      screen.getByLabelText('Choose Profile Photo File'),
      new File(['avatar'], 'avatar.png', { type: 'image/png' })
    );
    await screen.findByText(/Upload failed/i);
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' className='w-40'>
        <ChatAvatarUploadCard />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('opens the file picker when the dropzone is activated', async () => {
    const user = userEvent.setup();
    render(<ChatAvatarUploadCard />);

    const fileInput = screen.getByLabelText(
      'Choose Profile Photo File'
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    await user.click(
      screen.getByRole('button', {
        name: /Drop your photo here or click to upload/i,
      })
    );
    expect(clickSpy).toHaveBeenCalled();
  });

  it('uploads a valid image through the avatar mutation', async () => {
    const user = userEvent.setup();
    mocks.mutate.mockImplementation((file: File) => {
      mocks.onSuccess?.('https://example.com/avatar.jpg');
      return file;
    });

    render(<ChatAvatarUploadCard />);

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose Profile Photo File'), file);

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith(file);
    });
    expect(
      await screen.findByText('Profile photo updated')
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the mutation fails', async () => {
    const user = userEvent.setup();
    mocks.mutate.mockImplementation(() => {
      mocks.onError?.(new Error('Network offline'));
    });

    render(<ChatAvatarUploadCard />);

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose Profile Photo File'), file);

    expect(await screen.findByText('Network offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('stays non-interactive when no profile is selected', () => {
    mocks.profileId = null;
    render(<ChatAvatarUploadCard />);

    expect(
      screen.getByRole('button', {
        name: /Drop your photo here or click to upload/i,
      })
    ).toBeDisabled();
  });
});
