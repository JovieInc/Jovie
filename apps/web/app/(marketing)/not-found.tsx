import { Container } from '@/components/site/Container';
import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';

export const revalidate = false;

/**
 * Not-found page for all marketing routes.
 * Rendered inside the (marketing) layout which already provides
 * MarketingHeader and MarketingFooter — so this component must NOT
 * include its own header/footer to avoid double chrome.
 */
export default function NotFound() {
  return (
    <section className='system-b-root-not-found-page flex flex-1'>
      <Container className='system-b-root-not-found-container'>
        <div
          data-testid='not-found'
          className='system-b-root-not-found-content'
        >
          <NotFoundPageContent variant='generic' surface='root' />
        </div>
      </Container>
    </section>
  );
}
