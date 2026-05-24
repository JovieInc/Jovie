'use client';

import { useEffect, useRef, useState } from 'react';
import { NumberedSection } from '@/components/marketing';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
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

  return (
    <NumberedSection
      id='profile'
      sectionNumber='2.0'
      sectionTitle='Profile'
      heading='Profiles that convert.'
      description='Your artist page keeps streaming links, tips, tour dates, and fan capture in one place.'
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
          className='pb-4 sm:pb-6'
          style={{
            filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.35))',
          }}
        >
          <PhoneFrame className='lg:h-[634px] lg:w-[302px] xl:h-[664px] xl:w-[316px]'>
            <MarketingPhoneImage
              scenarioId='tim-white-profile-listen-mobile'
              altOverride='Artist profile page showing streaming links, tips, and tour dates'
              width={780}
              height={1688}
              sizes='(min-width: 1280px) 316px, (min-width: 1024px) 302px, 282px'
              className='h-full w-full object-cover object-top'
            />
          </PhoneFrame>
        </div>
      </div>
    </NumberedSection>
  );
}
