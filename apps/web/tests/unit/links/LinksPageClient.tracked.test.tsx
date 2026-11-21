import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkRow } from '@/app/app/(shell)/links/links-model';
import {
  linksBaseRow,
  renderLinksWorkspace,
} from './LinksPageClient.test-utils';

const { copyToClipboardMock, toastSuccessMock, toastErrorMock } = vi.hoisted(
  () => ({
    copyToClipboardMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  })
);

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: copyToClipboardMock,
}));

vi.mock('@/components/feedback', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { LinksPageClient } from '@/app/app/(shell)/links/LinksPageClient';
import { buildOneTapTrackedUrl } from '@/app/app/(shell)/links/links-tracked';

describe('LinksPageClient tracked copy', () => {
  beforeEach(() => {
    copyToClipboardMock.mockReset();
    copyToClipboardMock.mockResolvedValue(true);
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('one-tap copies a tracked campaign URL for a release row', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[linksBaseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );
    await user.click(screen.getByRole('button', { name: 'Copy Tracked Link' }));

    const expected = buildOneTapTrackedUrl(linksBaseRow);
    expect(copyToClipboardMock).toHaveBeenCalledWith(expected.url);
    expect(expected.url).toContain('utm_source=instagram');
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Copied Tracked Link' })
    ).toBeInTheDocument();
  });

  it('one-tap copies the existing /s short link for a source row', async () => {
    const user = userEvent.setup();
    const sourceRow: LinkRow = {
      ...linksBaseRow,
      id: 'source-poster-1',
      jovieUrl: 'https://jov.ie/s/tour-abc12345',
      title: 'Fall tour poster',
      clicksLabel: 'scans',
      utmSummary: 'qr_code / print / fall-tour',
    };
    renderLinksWorkspace(<LinksPageClient rows={[sourceRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/s/tour-abc12345' })
    );
    await user.click(screen.getByRole('button', { name: 'Copy Tracked Link' }));

    expect(copyToClipboardMock).toHaveBeenCalledWith(
      'https://jov.ie/s/tour-abc12345'
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Copied Tracked Link',
      expect.objectContaining({
        description: 'Short link already includes campaign tracking',
      })
    );
  });

  it('keeps Copy Tracked Link when the clipboard write fails', async () => {
    copyToClipboardMock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[linksBaseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );
    await user.click(screen.getByRole('button', { name: 'Copy Tracked Link' }));

    expect(toastErrorMock).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Copy Tracked Link' })
    ).toBeInTheDocument();
  });
});
