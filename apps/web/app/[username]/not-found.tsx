import Link from 'next/link';
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
          <p className='system-b-public-profile-not-found-code'>404</p>
          <h1 className='system-b-public-profile-not-found-title'>
            Profile not found
          </h1>
          <p className='system-b-public-profile-not-found-description'>
            This profile may have moved or the link may be incorrect.
          </p>

          <Link href='/' className='system-b-public-profile-not-found-action'>
            Return home
          </Link>
        </div>
      </div>
    </PublicPageShell>
  );
}
