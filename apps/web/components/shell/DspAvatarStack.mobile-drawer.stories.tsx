import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';
import { ReleaseEntityHeader } from '@/components/organisms/release-sidebar/ReleaseSidebarSections';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';

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

const meta = {
  title: 'Shell/DspAvatarStack/MobileDrawer',
  component: MobileReleaseDrawer,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MobileReleaseDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Passive fixture for the external browser's native scroll/keyboard proof. */
export const Layout: Story = {};
