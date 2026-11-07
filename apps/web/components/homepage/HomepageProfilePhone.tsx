import {
  Bell,
  CalendarDays,
  Ellipsis,
  House,
  Music2,
  User,
} from 'lucide-react';
import Image from 'next/image';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const PHONE_COPY = HOMEPAGE_EDITORIAL_COPY.profile.phone;

/**
 * Tim White's real profile at jov.ie/tim, drawn at the canonical 310px phone
 * (Pen WyQJb): identity, Get Updates, the latest release as the one thing the
 * profile leads with, and the profile tabs. Static, no data fetch: the page
 * stays fully static.
 */
export function HomepageProfilePhone({
  alt,
  release,
}: Readonly<{
  alt: string;
  release: { readonly title: string; readonly src: string };
}>) {
  return (
    <div className='hpv1-phone' role='img' aria-label={alt}>
      <div className='hpv1-phone__top' aria-hidden>
        <BrandLogo size='chrome' tone='muted' rounded={false} aria-hidden />
        <Ellipsis className='size-4' />
      </div>
      <div className='hpv1-phone__identity' aria-hidden>
        <Image
          src='/images/avatars/tim-white-profile.jpg'
          alt=''
          width={80}
          height={80}
          sizes='80px'
          className='hpv1-phone__avatar'
        />
        <p className='hpv1-phone__name'>{TIM_WHITE_PROFILE.name}</p>
        <p className='hpv1-phone__handle'>
          {TIM_WHITE_PROFILE.publicProfileDisplay}
        </p>
      </div>
      <div className='hpv1-phone__actions' aria-hidden>
        <span className='hpv1-phone__pill'>
          <Bell className='size-3.5' />
          {PHONE_COPY.getUpdates}
        </span>
        <SocialIcon platform='instagram' size={16} aria-hidden />
        <SocialIcon platform='tiktok' size={16} aria-hidden />
      </div>
      <div className='hpv1-phone__card' aria-hidden>
        <span className='hpv1-phone__card-label'>{PHONE_COPY.listen}</span>
        <Image
          src={release.src}
          alt=''
          width={104}
          height={104}
          sizes='104px'
          className='hpv1-phone__cover'
        />
        <p className='hpv1-phone__release'>{release.title}</p>
        <p className='hpv1-phone__artist'>{TIM_WHITE_PROFILE.name}</p>
        <span className='hpv1-phone__listen'>{PHONE_COPY.listenNow}</span>
      </div>
      <div className='hpv1-phone__tabs' aria-hidden>
        <span data-active='true'>
          <House className='size-4' />
        </span>
        <span>
          <Music2 className='size-4' />
        </span>
        <span>
          <CalendarDays className='size-4' />
        </span>
        <span>
          <User className='size-4' />
        </span>
      </div>
    </div>
  );
}
