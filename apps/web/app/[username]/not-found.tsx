import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import {
  resolveNotFoundPathname,
  resolveNotFoundVariant,
} from '@/lib/routing/not-found-context';

export default async function NotFound() {
  const pathname = await resolveNotFoundPathname();
  const variant = resolveNotFoundVariant(pathname);

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
