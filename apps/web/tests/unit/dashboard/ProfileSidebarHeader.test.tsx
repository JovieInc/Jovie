import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProfileHeaderParts } from '@/components/dashboard/organisms/profile-contact-sidebar/ProfileSidebarHeader';
import { downloadBlob } from '@/lib/utils/download';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/utils/download', () => ({
  downloadBlob: vi.fn(),
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: ({
    overflowActions,
  }: {
    overflowActions: Array<{ id: string; label: string; onClick: () => void }>;
  }) => (
    <div>
      {overflowActions.map(action => (
        <button key={action.id} onClick={action.onClick} type='button'>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

function HeaderHarness() {
  const { actions } = useProfileHeaderParts({
    username: 'timwhite',
    displayName: 'Tim White',
    profilePath: '/timwhite',
  });

  return <>{actions}</>;
}

describe('ProfileSidebarHeader QR download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads QR as blob without opening a new tab', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['qr'], { type: 'image/png' }), { status: 200 })
      );

    vi.stubGlobal('fetch', fetchMock);

    const openSpy = vi
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null as unknown as Window);

    render(<HeaderHarness />);
    await user.click(screen.getByRole('button', { name: 'Download QR code' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob).toHaveBeenLastCalledWith(
      expect.anything(),
      'timwhite-qr.png'
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('QR code downloaded');

    openSpy.mockRestore();
  });

  it('shows an error toast when QR fetch fails', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );

    render(<HeaderHarness />);
    await user.click(screen.getByRole('button', { name: 'Download QR code' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to download QR code');
    });
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
