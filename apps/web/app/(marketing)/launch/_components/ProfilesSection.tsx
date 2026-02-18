import { ProfileMockup } from '@/components/home/ProfileMockup';
import { Divider, WRAP } from './shared';

export function ProfilesSection() {
  return (
    <>
      {/* ═══ 5. DYNAMIC PROFILES ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='profiles-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
          id='features'
        >
          <div>
            <h2
              id='profiles-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              A link-in-bio built to convert,{' '}
              <span className='text-secondary-token'>not just display</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Most link-in-bio pages are a graveyard of links. Yours adapts: new
              visitors get a subscribe CTA, returning fans get a listen CTA
              routed to their preferred platform.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '1.1', title: 'Adaptive CTA' },
                { num: '1.2', title: 'Email + SMS Capture' },
                { num: '1.3', title: 'Streaming Preference Memory' },
                { num: '1.4', title: 'Custom Domains' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
            {/* Stat callout */}
            <div className='flex flex-col sm:flex-row items-baseline gap-4 pt-8 mt-8 border-t border-subtle'>
              <div className='font-medium shrink-0 text-[2.5rem] tracking-tight leading-none'>
                371%
              </div>
              <div>
                <div className='text-sm text-secondary-token leading-normal max-w-[380px]'>
                  more clicks when a page has one CTA instead of many. Pages
                  with a single action convert at 13.5% vs 10.5% for pages with
                  5+ links.
                </div>
                <div className='text-[0.7rem] text-tertiary-token mt-1'>
                  Source: WordStream, Omnisend
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 6. PROFILE MOCKUP ═══ */}
      <div className={`${WRAP} pb-16`}>
        <ProfileMockup />
      </div>
    </>
  );
}
