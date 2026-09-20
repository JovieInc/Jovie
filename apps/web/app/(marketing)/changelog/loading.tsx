import { MarketingContainer } from '@/components/marketing';
import './changelog-editorial.css';

/**
 * Skeleton mirrors the release-journal hero + O64tu entry-row geometry of
 * ./page.tsx so the loading state lands on the final layout without shift.
 */
export default function ChangelogLoading() {
  return (
    <div aria-hidden='true' className='min-h-screen bg-page text-primary-token'>
      {/* Hero skeleton: kicker, display title, support line, version timeline */}
      <section className='changelog-hero'>
        <MarketingContainer width='page' className='changelog-hero__inner'>
          <div className='changelog-hero__masthead'>
            <div className='h-3 w-24 skeleton rounded' />
            <div className='h-20 w-2/3 max-w-xl skeleton rounded-lg' />
            <div className='h-6 w-80 max-w-full skeleton rounded' />
          </div>
          <div className='changelog-hero__timeline'>
            <div className='changelog-hero__timeline-entries'>
              {[0, 1, 2].map(index => (
                <div
                  key={`cl-hero-skeleton-${index}`}
                  className='changelog-hero__timeline-link'
                >
                  <div className='h-1.5 w-1.5 skeleton rounded-full' />
                  <div className='h-3 w-20 skeleton rounded' />
                  <div className='h-3 w-40 skeleton rounded' />
                </div>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </section>

      {/* Archive lead skeleton: copy column + subscribe column */}
      <MarketingContainer width='page' className='changelog-lead'>
        <div className='changelog-lead__grid'>
          <div className='changelog-lead__copy'>
            <div className='h-4 w-20 skeleton rounded' />
            <div className='h-16 w-3/4 skeleton rounded-lg' />
            <div className='h-5 w-full max-w-lg skeleton rounded' />
          </div>
          <div className='h-48 w-full skeleton rounded-2xl' />
        </div>
      </MarketingContainer>

      {/* Entry rows skeleton */}
      <MarketingContainer width='page' className='changelog-entries'>
        {[0, 1].map(index => (
          <div key={`cl-entry-skeleton-${index}`} className='changelog-entry'>
            <div className='changelog-entry__date'>
              <div className='h-4 w-28 skeleton rounded' />
            </div>
            <div className='changelog-entry__main'>
              <div className='changelog-entry__content'>
                <div className='h-3 w-16 skeleton rounded' />
                <div className='h-8 w-2/3 skeleton rounded' />
                <div className='changelog-skeleton-media skeleton' />
                <div className='space-y-2'>
                  <div className='h-4 w-full skeleton rounded' />
                  <div className='h-4 w-5/6 skeleton rounded' />
                </div>
              </div>
              <div className='changelog-entry__card'>
                <div className='changelog-skeleton-card-media skeleton' />
                <div className='h-5 w-3/4 skeleton rounded' />
                <div className='h-3 w-1/2 skeleton rounded' />
              </div>
            </div>
          </div>
        ))}
      </MarketingContainer>
    </div>
  );
}
