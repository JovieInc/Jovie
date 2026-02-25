import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilePhotoContextMenu } from '@/components/profile/ProfilePhotoContextMenu';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';

const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

const mockCaptureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

vi.mock('lucide-react', () => ({
  Download: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'download-icon' }),
  FileCode2: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'filecode-icon' }),
  ImageDown: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'imagedown-icon' }),
  QrCode: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'qrcode-icon' }),
  ChevronRight: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'chevron-icon' }),
}));

const originalSizes: AvatarSize[] = [
  {
    key: 'original',
    label: 'Original',
    url: 'https://cdn.jov.ie/avatar-original.png',
  },
];

describe('ProfilePhotoContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['ok']), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      )
    );
  });

  it('renders download submenu options', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ProfilePhotoContextMenu
        name='Test Artist'
        handle='testartist'
        tagline='Future pop artist'
        sizes={originalSizes}
        allowDownloads={true}
      >
        <div>Avatar</div>
      </ProfilePhotoContextMenu>
    );

    await user.pointer({
      target: screen.getByText('Avatar'),
      keys: '[MouseRight]',
    });

    await user.hover(screen.getByRole('menuitem', { name: 'Download' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Download as VXAR' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Download QR Code' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Download Profile Photo' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Download Profile as JSON' })
    ).toBeInTheDocument();
  });

  it('does not render context menu wrapper when downloads are disabled', () => {
    render(
      <ProfilePhotoContextMenu
        name='Test Artist'
        handle='testartist'
        sizes={[]}
        allowDownloads={false}
      >
        <button type='button'>Avatar Trigger</button>
      </ProfilePhotoContextMenu>
    );

    expect(
      screen.getByRole('button', { name: 'Avatar Trigger' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Download Profile Photo')
    ).not.toBeInTheDocument();
  });
});
