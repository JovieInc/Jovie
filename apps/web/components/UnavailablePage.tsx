import { Logo } from '@/components/atoms/Logo';

/**
 * Generic "service unavailable" page shown to blocked users.
 *
 * Used by:
 * - app/unavailable/page.tsx (via middleware rewrite for non-/app paths)
 * - app/app/(shell)/layout.tsx (inline render for /app paths)
 *
 * Intentionally minimal. No error codes, no support links,
 * no language that indicates account-level enforcement.
 * Logo is non-interactive to avoid redirect loops for banned users.
 */
export function UnavailablePage() {
  return (
    <div className='system-b-unavailable-page'>
      <div className='system-b-unavailable-content'>
        <div className='system-b-unavailable-mark' aria-hidden='true'>
          <Logo aria-hidden size='lg' tone='white' variant='icon' />
        </div>

        <h1 className='system-b-unavailable-title'>
          Jovie is unavailable right now
        </h1>

        <p className='system-b-unavailable-copy'>Please try again later.</p>
      </div>
    </div>
  );
}
