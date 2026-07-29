import { Container } from '@/components/site/Container';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';

export default function NotFound() {
  return (
    <div className='system-b-root-not-found-page system-b-marketing dark min-h-screen'>
      <MarketingHeader logoSize='xs' variant='minimal' />

      <main
        id='main-content'
        data-testid='not-found'
        className='system-b-root-not-found-main'
      >
        <Container className='system-b-root-not-found-container'>
          <div className='system-b-root-not-found-content'>
            <NotFoundPageContent variant='generic' surface='root' />
          </div>
        </Container>
      </main>

      <MarketingFooter />
    </div>
  );
}
