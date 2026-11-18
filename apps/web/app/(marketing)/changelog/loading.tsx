import { MarketingContainer } from '@/components/marketing';
import './changelog-editorial.css';

/**
 * Skeleton mirrors the header and day-row geometry of ./page.tsx so the
 * loading state lands on the final layout without shift.
 */
export default function ChangelogLoading() {
  return (
    <div aria-hidden='true' className='min-h-screen bg-page text-primary-token'>
      <MarketingContainer width='page'>
        <div className='changelog-header'>
          <div className='changelog-header__copy'>
            <div className='h-14 w-64 max-w-full skeleton rounded-lg' />
            <div className='h-6 w-96 max-w-full skeleton rounded' />
          </div>
          <div className='changelog-subscribe'>
            <div className='h-28 w-full skeleton rounded-2xl' />
          </div>
        </div>
        <div className='changelog-feed'>
          {[0, 1].map(index => (
            <div key={`cl-day-skeleton-${index}`} className='changelog-day'>
              <div className='changelog-day__rail'>
                <div className='h-4 w-28 skeleton rounded' />
              </div>
              <div className='changelog-day__body'>
                <div className='changelog-post'>
                  <div className='h-5 w-16 skeleton rounded-full' />
                  <div className='h-9 w-2/3 skeleton rounded' />
                  <div className='space-y-2'>
                    <div className='h-4 w-full skeleton rounded' />
                    <div className='h-4 w-5/6 skeleton rounded' />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </MarketingContainer>
    </div>
  );
}
