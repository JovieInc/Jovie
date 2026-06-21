import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export default function NotFound() {
  // This boundary only mounts under /[username]. Any miss here is a profile
  // lookup failure — avoid headers() so ISR profile routes stay static on the
  // standalone production server used by PR smoke.
  const variant = 'profile-miss' as const;

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
          <NotFoundPageContent variant={variant} surface='profile' />
        </div>
      </div>
    </PublicPageShell>
  );
}
