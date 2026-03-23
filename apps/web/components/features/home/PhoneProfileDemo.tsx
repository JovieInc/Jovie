'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { NumberedSection } from '@/components/marketing';
import { PhoneFrame } from './PhoneFrame';

const SUB_ITEMS = [
  {
    number: '2.1',
    title: 'Streaming Links',
    description:
      'One clean page for every link out — Spotify, Apple Music, YouTube Music, and more.',
  },
  {
    number: '2.2',
    title: 'Fan Capture',
    description:
      'Collect emails without extra tooling. Every profile visit is a conversion opportunity.',
  },
  {
    number: '2.3',
    title: 'Monetization',
    description:
      'Tips, tickets, and launch traffic in one flow. Fans support you directly.',
  },
  {
    number: '2.4',
    title: 'Tour Dates',
    description:
      'Auto-synced show listings that update across your profile and smart links.',
  },
];

export function PhoneProfileDemo() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isImageAvailable, setIsImageAvailable] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    const section = phoneRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isActive = true;

    fetch('/product-screenshots/profile-phone.png', { method: 'HEAD' })
      .then(response => {
        if (isActive) {
          setIsImageAvailable(response.ok);
        }
      })
      .catch(() => {
        if (isActive) {
          setIsImageAvailable(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <NumberedSection
      id='profile'
      sectionNumber='2.0'
      sectionTitle='Profile'
      heading='Profiles that convert.'
      description='Your artist page handles streaming, tips, tour dates, and fan capture in one place. It looks polished, updates fast, and gives every release a home.'
      subItems={SUB_ITEMS}
    >
      <div
        ref={phoneRef}
        className='flex justify-center'
        style={{
          transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
          opacity: isVisible ? 1 : 0,
          transition:
            'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.7s ease-out',
        }}
      >
        <div
          className='scale-[1.06] sm:scale-[1.1] lg:scale-[1.14] xl:scale-[1.18]'
          style={{
            filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.35))',
          }}
        >
          <PhoneFrame>
            {isImageAvailable === false ? (
              <div className='grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top,rgba(113,112,255,0.15),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-6 text-center'>
                <div>
                  <p className='text-sm font-medium text-primary-token'>
                    Profile preview
                  </p>
                  <p className='mt-2 text-xs leading-5 text-secondary-token'>
                    Generated phone screenshot unavailable in this worktree.
                  </p>
                </div>
              </div>
            ) : isImageAvailable === true ? (
              <Image
                src='/product-screenshots/profile-phone.png'
                alt='Artist profile page showing streaming links, tips, and tour dates'
                width={780}
                height={1688}
                className='h-full w-full object-cover object-top'
              />
            ) : (
              <div className='h-full w-full animate-pulse bg-surface-1' />
            )}
          </PhoneFrame>
        </div>
      </div>
    </NumberedSection>
  );
}
