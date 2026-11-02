import { Button } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';
import { ReleaseEntityHeader } from '@/components/organisms/release-sidebar/ReleaseSidebarSections';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/hooks/useBreakpoint', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBreakpoint')>()),
  useBreakpointDown: () => true,
}));

const drawerRelease: ReleaseViewModel = {
  id: 'dsp-drawer-release',
  profileId: 'dsp-drawer-profile',
  title: 'Distribution Details',
  artistNames: ['Jovie'],
  status: 'released',
  slug: 'distribution-details',
  smartLinkPath: '/distribution-details',
  releaseType: 'album',
  isExplicit: false,
  totalTracks: 10,
  providers: (
    [
      'spotify',
      'apple_music',
      'youtube_music',
      'tidal',
      'soundcloud',
      'deezer',
      'amazon_music',
      'bandcamp',
      'pandora',
      'qobuz',
    ] as const
  ).map(key => ({
    key,
    label: PROVIDER_CONFIG[key].label,
    path: key,
    isPrimary: key === 'spotify',
    url: `https://example.com/releases/${key}`,
    source: 'manual',
    updatedAt: '2026-10-27',
  })),
};

function MobileReleaseDrawer() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button data-testid='dsp-background-action' variant='secondary'>
        Background action
      </Button>
      <RightDrawer
        isOpen={open}
        width={360}
        ariaLabel='Release details'
        onKeyDown={event => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <Button variant='secondary' onClick={() => setOpen(false)}>
          Close inspector
        </Button>
        <ReleaseEntityHeader
          release={drawerRelease}
          artistName='Jovie'
          providerConfig={PROVIDER_CONFIG}
          canUploadArtwork={false}
          canRevertArtwork={false}
          onArtworkUpload={undefined}
          onArtworkRevert={undefined}
          allowDownloads={false}
          previewUrl={null}
          isPlaying={false}
          onTogglePreview={() => undefined}
        />
      </RightDrawer>
    </>
  );
}

describe('DSP details inside the real mobile release drawer', () => {
  it.each(['pointer', 'Enter', 'Space'] as const)(
    'keeps %s activation and Escape inside the owning modal',
    async activation => {
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <MobileReleaseDrawer />
        </QueryClientProvider>
      );
      const owner = screen.getByRole('dialog', { name: 'Release details' });
      expect(owner).toHaveAttribute('aria-modal', 'true');

      const background = screen.getByTestId('dsp-background-action');
      act(() => background.focus());
      expect(background).not.toHaveFocus();
      expect(owner.contains(document.activeElement)).toBe(true);

      const trigger = within(owner).getByRole('button', {
        name: /^View DSP Distribution Details/i,
      });
      if (activation === 'pointer') await user.click(trigger);
      else {
        act(() => trigger.focus());
        await user.keyboard(activation === 'Enter' ? '{Enter}' : ' ');
      }

      const details = screen.getByRole('dialog', {
        name: 'DSP Distribution Details',
      });
      const list = within(details).getByRole('region', {
        name: 'DSP Availability',
      });
      expect(details).toHaveFocus();
      expect(owner).toContainElement(details);
      expect(owner.contains(document.activeElement)).toBe(true);
      expect(
        within(list).getByText('Spotify', { exact: true })
      ).toBeInTheDocument();
      expect(
        within(list).getByText('Qobuz', { exact: true })
      ).toBeInTheDocument();

      await user.tab();
      expect(details).toHaveFocus();
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'DSP Distribution Details' })
        ).not.toBeInTheDocument()
      );
      expect(screen.getByRole('dialog', { name: 'Release details' })).toBe(
        owner
      );
      expect(owner).toHaveAttribute('aria-modal', 'true');
      expect(trigger).toHaveFocus();

      act(() => background.focus());
      expect(background).not.toHaveFocus();
      expect(owner.contains(document.activeElement)).toBe(true);

      act(() =>
        within(owner).getByRole('button', { name: 'Close inspector' }).focus()
      );
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Release details' })
        ).not.toBeInTheDocument()
      );
    }
  );
});
