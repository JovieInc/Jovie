import {
  Bell,
  CalendarDays,
  Ellipsis,
  House,
  Music2,
  User,
} from 'lucide-react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ImageryStage } from '@/components/marketing/ImageryStage';
import { HOMEPAGE_FEATURED_ARTIST } from '@/data/demoArtists';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { Anchor } from './v3/ProductUi';

const PHONE_COPY = HOMEPAGE_EDITORIAL_COPY.profile.phone;
const ARTIST = HOMEPAGE_FEATURED_ARTIST;

/**
 * The featured artist's profile, Listen mode (Pen WyQJb), drawn from the
 * featured slot (Tim for now, Tim 2026-11-12): name and handle, no
 * verified badge, Get Updates, Instagram and TikTok, the latest release as
 * the one thing the profile leads with, and the profile tabs.
 * Static, no data fetch: the page stays fully static. The anchors are where
 * the homepage callouts attach.
 */
export function HomepageProfilePhone({
  alt,
  release,
}: Readonly<{
  alt: string;
  release: { readonly title: string; readonly src: string };
}>) {
  return (
    <div className='hv3-pp' role='img' aria-label={alt}>
      <div className='hv3-pp__bar' aria-hidden>
        <BrandLogo
          size='compact'
          rounded={false}
          aria-hidden
          className='hv3-pp__mark'
        />
        <Ellipsis className='hv3-ui-i' />
      </div>
      <div className='hv3-pp__id' aria-hidden>
        <span className='hv3-pp__av'>
          <ImageryStage
            src={ARTIST.avatarSrc}
            alt=''
            width={72}
            height={72}
            sizes='160px'
          />
        </span>
        <p className='hv3-pp__name'>
          {ARTIST.name}
          <Anchor id='name' className='hv3-anchor--after-tight' />
        </p>
        <p className='hv3-pp__handle'>
          {ARTIST.profileDisplay}
          <Anchor id='handle' className='hv3-anchor--after' />
        </p>
      </div>
      <div className='hv3-pp__acts' aria-hidden>
        <span className='hv3-pp__upd'>
          <Anchor id='updates' className='hv3-anchor--start' />
          <Bell className='hv3-ui-i' />
          {PHONE_COPY.getUpdates}
        </span>
        <span>
          <SocialIcon platform='instagram' size={16} aria-hidden />
        </span>
        <span>
          <SocialIcon platform='tiktok' size={16} aria-hidden />
        </span>
      </div>
      <div className='hv3-pp__card' aria-hidden>
        <p className='hv3-pp__lbl'>{PHONE_COPY.listen}</p>
        <div className='hv3-pp__art'>
          <ImageryStage
            src={release.src}
            alt=''
            width={112}
            height={112}
            sizes='240px'
            className='hv3-cover'
          />
        </div>
        <p className='hv3-pp__title'>{release.title}</p>
        <p className='hv3-pp__by'>{ARTIST.name}</p>
        <span className='hv3-pp__cta'>{PHONE_COPY.listenNow}</span>
      </div>
      <div className='hv3-pp__nav' aria-hidden>
        <span data-active='true'>
          <House className='hv3-ui-i' />
        </span>
        <span>
          <Music2 className='hv3-ui-i' />
        </span>
        <span>
          <CalendarDays className='hv3-ui-i' />
        </span>
        <span>
          <User className='hv3-ui-i' />
        </span>
      </div>
    </div>
  );
}
