import { Container } from '@/components/site/Container';
import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export default function NotFound() {
  return (
    <PublicPageShell
      className='system-b-root-not-found-page system-b-marketing dark'
      headerVariant='minimal'
      mainClassName='system-b-root-not-found-main'
    >
      <Container
        data-testid='not-found'
        className='system-b-root-not-found-container'
      >
        <div className='system-b-root-not-found-content'>
          <NotFoundPageContent variant='generic' surface='root' />
        </div>
      </Container>
    </PublicPageShell>
  );
}
