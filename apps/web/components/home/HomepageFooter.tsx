import Link from 'next/link';
import { CookieSettingsFooterButton } from '@/components/molecules/CookieSettingsFooterButton';
import { Container } from '@/components/site/Container';
import { APP_NAME, LEGAL } from '@/constants/app';

export function HomepageFooter() {
  return (
    <footer
      className='py-8'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 510,
              letterSpacing: '-0.01em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            © {new Date().getFullYear()} {APP_NAME}
          </div>

          <div
            className='flex items-center gap-6'
            style={{
              fontSize: '13px',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            <Link
              href={LEGAL.privacyPath}
              className='transition-colors duration-[160ms]'
              style={{ color: 'inherit' }}
              onMouseEnter={e =>
                (e.currentTarget.style.color = 'var(--linear-text-secondary)')
              }
              onMouseLeave={e =>
                (e.currentTarget.style.color = 'var(--linear-text-tertiary)')
              }
            >
              Privacy
            </Link>
            <Link
              href={LEGAL.termsPath}
              className='transition-colors duration-[160ms]'
              style={{ color: 'inherit' }}
              onMouseEnter={e =>
                (e.currentTarget.style.color = 'var(--linear-text-secondary)')
              }
              onMouseLeave={e =>
                (e.currentTarget.style.color = 'var(--linear-text-tertiary)')
              }
            >
              Terms
            </Link>
            <CookieSettingsFooterButton
              className='transition-colors duration-[160ms]'
              style={{ color: 'inherit' }}
            />
          </div>
        </div>
      </Container>
    </footer>
  );
}
