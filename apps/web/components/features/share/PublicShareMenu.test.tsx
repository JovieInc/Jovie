import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareContext, ShareLaunchResult } from '@/lib/share/types';
import {
  PUBLIC_SHARE_DIRECT_ITEM_CLASS,
  PUBLIC_SHARE_DRAWER_ITEM_CLASS,
  PUBLIC_SHARE_MENU_ITEM_CLASS,
  PublicShareActionList,
} from './PublicShareMenu';

const { launchMock, toastMock } = vi.hoisted(() => ({
  launchMock:
    vi.fn<(id: string, context: ShareContext) => Promise<ShareLaunchResult>>(),
  toastMock: {
    success: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/share/destinations', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/share/destinations')>();
  return {
    ...original,
    launchPublicShareDestination: (...args: Parameters<typeof launchMock>) =>
      launchMock(...args),
  };
});

vi.mock('@/components/feedback', () => ({
  toast: toastMock,
}));

const context = {
  surfaceType: 'release',
  title: 'Midnight Drive',
  canonicalUrl: 'https://jovie.app/timwhite/midnight-drive',
  displayUrl: 'jovie.app/timwhite/midnight-drive',
  imageUrl: null,
  preparedText: 'Listen to Midnight Drive by Tim White on Jovie',
  emailSubject: 'Midnight Drive',
  emailBody: 'Listen to Midnight Drive on Jovie',
  asset: {
    kind: 'story',
    url: 'https://example.com/story.png',
    fileName: 'story.png',
    mimeType: 'image/png',
    width: 1080,
    height: 1920,
  },
  utmContext: {},
} as unknown as ShareContext;

describe('PublicShareActionList', () => {
  beforeEach(() => {
    launchMock.mockReset();
    toastMock.success.mockReset();
    toastMock.message.mockReset();
    toastMock.error.mockReset();
  });

  it('treats a cancelled share-sheet dismissal as a silent no-op', async () => {
    launchMock.mockResolvedValue({ status: 'cancelled' });
    const onActionComplete = vi.fn();

    render(
      <PublicShareActionList
        context={context}
        onActionComplete={onActionComplete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /instagram/i }));
    await screen.findByRole('button', { name: /instagram/i });

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.message).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(onActionComplete).not.toHaveBeenCalled();
    expect(screen.queryByText(/copied/i)).not.toBeInTheDocument();
  });

  it('shows helper text and a message toast on fallback', async () => {
    launchMock.mockResolvedValue({
      status: 'fallback',
      helperText: 'Share text copied — paste it into your post.',
    });

    render(<PublicShareActionList context={context} />);

    fireEvent.click(screen.getByRole('button', { name: /instagram/i }));

    expect(
      await screen.findByText('Share text copied — paste it into your post.')
    ).toBeInTheDocument();
    expect(toastMock.message).toHaveBeenCalledTimes(1);
  });

  it('aligns rows to the drawer header they sit under', () => {
    const { rerender } = render(<PublicShareActionList context={context} />);
    const row = () => screen.getAllByRole('button')[0];
    expect(row().className).toBe(PUBLIC_SHARE_MENU_ITEM_CLASS);

    // Under a back button: icons centre under it, labels on the title edge.
    rerender(
      <PublicShareActionList context={context} drawerHeader='secondary' />
    );
    expect(row().className).toBe(PUBLIC_SHARE_DRAWER_ITEM_CLASS);
    expect(row().className).toContain('gap-6');

    // No back button: icons start on the title edge.
    rerender(<PublicShareActionList context={context} drawerHeader='direct' />);
    expect(row().className).toBe(PUBLIC_SHARE_DIRECT_ITEM_CLASS);
    expect(row().className).toContain('-mx-3 px-3');
  });
});
