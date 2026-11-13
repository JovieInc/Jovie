import '../components/marketing/MarketingSnapRail.css';
import '../components/marketing/artist-profile/ShellCtaButton.css';
import { RootNotFoundFooter } from '@/components/organisms/RootNotFoundFooter';
import { RootNotFoundHeader } from '@/components/organisms/RootNotFoundHeader';
import { Container } from '@/components/site/Container';
import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';

// The 404 renders the code-default chrome synchronously: it is the fallback
// page, so it must not depend on a store read to draw.
//
// This boundary is part of every route's initial load, so everything it
// imports ships everywhere. The chrome is server markup with plain links;
// never import MarketingHeader, MarketingFooter or HeaderNav here (they pull
// the auth client, motion, toasts and the query client onto every route).
// tests/unit/app/root-not-found-client-graph.test.ts enforces it.
export default function NotFound() {
  return (
    <div className='system-b-root-not-found-page system-b-marketing dark min-h-screen'>
      <RootNotFoundHeader />

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

      <RootNotFoundFooter />
    </div>
  );
}
