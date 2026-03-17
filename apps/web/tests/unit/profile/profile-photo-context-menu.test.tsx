import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilePhotoContextMenu } from '@/features/profile/ProfilePhotoContextMenu';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';

const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

const mockCaptureException = vi.fn();
vi.mock('@/lib/sentry/client-lite', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

vi.mock('lucide-react', () => ({
  Download: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'download-icon' }),
  ImageDown: (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-testid': 'imagedown-icon' }),
}));

const multipleSizes: AvatarSize[] = [
  {
    key: 'medium',
    label: 'Medium (400 x 400)',
    url: '/_next/image?url=https%3A%2F%2Fcdn.jov.ie%2Favatar-original.png&w=400&q=90',
  },
  {
    key: 'large',
    label: 'Large (1000 x 1000)',
    url: '/_next/image?url=https%3A%2F%2Fcdn.jov.ie%2Favatar-original.png&w=1000&q=90',
  },
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

  it('renders direct download menu with size options and original', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ProfilePhotoContextMenu
        name='Test Artist'
        handle='testartist'
        sizes={multipleSizes}
        allowDownloads={true}
      >
        <div>Avatar</div>
      </ProfilePhotoContextMenu>
    );

    await user.pointer({
      target: screen.getByText('Avatar'),
      keys: '[MouseRight]',
    });

    expect(
      await screen.findByText('Download Profile Photo')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Medium (400 x 400)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Large (1000 x 1000)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Original' })
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
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
  });
});
