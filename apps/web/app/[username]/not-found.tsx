import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export default function NotFound() {
  return (
    <PublicPageShell
      headerVariant='minimal'
      mainClassName='system-b-public-profile-not-found-main'
    >
      <div
        data-testid='not-found'
        className='profile-viewport system-b-public-profile-not-found-container'
      >
        <div className='system-b-public-profile-not-found-content'>
          <NotFoundPageContent variant='generic' surface='profile' />
        </div>
      </div>
    </PublicPageShell>
  );
}
