'use client';

import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import {
  SMART_LINK_MENU_ICON_CLASS,
  SMART_LINK_MENU_ITEM_CLASS,
  SmartLinkShell,
} from '@/features/release/SmartLinkShell';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import { buildReleaseShareContext } from '@/lib/share/context';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { DemoClientProviders } from './DemoClientProviders';

const THE_DEEP_END_ARTWORK = '/img/releases/the-deep-end.jpg';
const THE_DEEP_END_ARTIST = 'Cosmic Gate & Tim White';
const THE_DEEP_END_LISTEN_URL = 'https://cosmicgate.choons.at/thedeepend';
const THE_DEEP_END_APPLE_URL =
  'https://music.apple.com/ie/album/the-deep-end-single/1207348536';
const THE_DEEP_END_SOUNDCLOUD_URL =
  'https://soundcloud.com/blackholerecordings/cosmic-gate-tim-white-the-deep-end-asot799';

/**
 * Demo surface for the live Deep End smart link state.
 * Uses verified release credit and real artwork so marketing screenshots never
 * show empty placeholders or misattribute the record.
 */
export function DemoReleasePresaveSurface() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareContext = buildReleaseShareContext({
    username: TIM_WHITE_PROFILE.handle,
    slug: 'the-deep-end',
    title: 'The Deep End',
    artistName: THE_DEEP_END_ARTIST,
    artworkUrl: THE_DEEP_END_ARTWORK,
  });
  const appleConfig = DSP_LOGO_CONFIG.apple_music;
  const soundcloudConfig = DSP_LOGO_CONFIG.soundcloud;

  return (
    <DemoClientProviders>
      <div data-testid='demo-showcase-release-presave'>
        <SmartLinkShell
          artworkUrl={THE_DEEP_END_ARTWORK}
          artworkAlt='The Deep End artwork'
          onMenuOpen={() => setMenuOpen(true)}
          showBrandMark={false}
          heroOverlay={
            <div className='absolute inset-x-0 bottom-5 z-10 px-5'>
              <p className='mb-2 inline-flex rounded-full border border-white/[0.1] bg-black/35 px-2.5 py-1 text-[11px] font-[520] uppercase tracking-[0.08em] text-white/72 backdrop-blur-xl'>
                Out now
              </p>
              <h1 className='text-[28px] font-semibold leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
                The Deep End
              </h1>
              <Link
                href={`/${TIM_WHITE_PROFILE.handle}`}
                className='mt-1 block text-[14px] font-[450] text-white/70 transition-colors hover:text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'
              >
                {THE_DEEP_END_ARTIST}
              </Link>
            </div>
          }
        >
          <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-4'>
            <div className='space-y-3'>
              <SmartLinkProviderButton
                label='Listen everywhere'
                href={THE_DEEP_END_LISTEN_URL}
              />
              <SmartLinkProviderButton
                label='Apple Music'
                iconPath={appleConfig?.iconPath}
                href={THE_DEEP_END_APPLE_URL}
              />
              <SmartLinkProviderButton
                label='SoundCloud'
                iconPath={soundcloudConfig?.iconPath}
                href={THE_DEEP_END_SOUNDCLOUD_URL}
              />
            </div>

            <div className='mt-auto'>
              <SmartLinkPoweredByFooter />
            </div>
          </div>
        </SmartLinkShell>
        <ProfileDrawerShell
          open={menuOpen}
          onOpenChange={setMenuOpen}
          title='Menu'
        >
          <div className='flex flex-col gap-0.5'>
            <button
              type='button'
              className={SMART_LINK_MENU_ITEM_CLASS}
              onClick={() => {
                setMenuOpen(false);
                setShareOpen(true);
              }}
            >
              <Share2 className={SMART_LINK_MENU_ICON_CLASS} />
              Share
            </button>
          </div>
        </ProfileDrawerShell>
        <ProfileDrawerShell
          open={shareOpen}
          onOpenChange={setShareOpen}
          title='Share'
          subtitle='Share this release'
        >
          <PublicShareActionList
            context={shareContext}
            onActionComplete={() => setShareOpen(false)}
          />
        </ProfileDrawerShell>
      </div>
    </DemoClientProviders>
  );
}
