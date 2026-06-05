import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function NotFound() {
  return (
    <div className='dark linear-marketing min-h-screen bg-base text-primary-token'>
      <MarketingHeader logoSize='xs' variant='minimal' />

      <main
        id='main-content'
        data-testid='not-found'
        className='system-b-root-not-found-main'
      >
        <Container className='system-b-root-not-found-container'>
          <div className='system-b-root-not-found-content'>
            <div className='system-b-root-not-found-code-wrap'>
              <span className='system-b-root-not-found-code' aria-hidden='true'>
                404
              </span>
            </div>

            <div className='system-b-root-not-found-copy'>
              <h1 className='system-b-root-not-found-title'>Page not found</h1>
              <p className='system-b-root-not-found-description'>
                The link you followed may be broken, or the page may have been
                removed.
              </p>

              <Link
                href='/'
                className='system-b-root-not-found-action focus-ring-transparent-offset'
              >
                Return home
              </Link>
            </div>
          </div>
        </Container>
      </main>

      <MarketingFooter />
    </div>
  );
}
