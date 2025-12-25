import Link from 'next/link';
import { CookieSettingsFooterButton } from '@/components/molecules/CookieSettingsFooterButton';
import { Container } from '@/components/site/Container';
import { APP_NAME, LEGAL } from '@/constants/app';

export function HomepageFooter() {
  return (
    <footer className='py-8 border-t border-subtle bg-base'>
      <Container size='homepage'>
        <div className='flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-secondary-token'>
          <div>
            © {new Date().getFullYear()} {APP_NAME}
          </div>

          <div className='flex items-center gap-6'>
            <Link
              href={LEGAL.privacyPath}
              className='hover:text-primary-token transition-colors'
            >
              Privacy
            </Link>
            <Link
              href={LEGAL.termsPath}
              className='hover:text-primary-token transition-colors'
            >
              Terms
            </Link>
            <CookieSettingsFooterButton className='hover:text-primary-token transition-colors' />
          </div>
        </div>
      </Container>
    </footer>
  );
}
