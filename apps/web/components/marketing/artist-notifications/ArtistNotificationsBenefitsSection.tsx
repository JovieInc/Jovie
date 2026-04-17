import { ArtistProfileSectionHeader } from '@/components/marketing/artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import type { ArtistNotificationsLandingCopy } from '@/data/artistNotificationsCopy';

interface ArtistNotificationsBenefitsSectionProps {
  readonly benefits: ArtistNotificationsLandingCopy['benefits'];
}

export function ArtistNotificationsBenefitsSection({
  benefits,
}: Readonly<ArtistNotificationsBenefitsSectionProps>) {
  return (
    <ArtistProfileSectionShell
      width='landing'
      className='py-20 sm:py-24 lg:py-28'
      containerClassName='lg:max-w-none'
    >
      <div className='mx-auto max-w-[1260px] px-5 sm:px-8 lg:px-10'>
        <ArtistProfileSectionHeader
          align='left'
          headline={benefits.headline}
          body={benefits.body}
          className='max-w-[42rem]'
          headlineClassName='max-w-[11ch] text-[clamp(2.8rem,4.8vw,4.35rem)]'
          bodyClassName='max-w-[34rem]'
        />

        <div className='mt-8 grid gap-8 lg:grid-cols-3 lg:gap-10'>
          {benefits.items.map(item => (
            <article key={item.title}>
              <h3 className='max-w-[18ch] text-[1.2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-primary-token'>
                {item.title}
              </h3>
              <p className='mt-3 max-w-[32ch] text-[14px] leading-[1.65] text-secondary-token'>
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
