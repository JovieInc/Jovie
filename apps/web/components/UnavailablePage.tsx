import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';

/**
 * Generic "service unavailable" page shown to blocked users.
 *
 * Used by:
 * - app/unavailable/page.tsx (via middleware rewrite for non-/app paths)
 * - app/app/(shell)/layout.tsx (inline render for /app paths)
 *
 * Intentionally minimal. No error codes, no support links,
 * no language that indicates account-level enforcement.
 * Logo is plain SVG — never a rounded box outside of app icons.
 */
export function UnavailablePage() {
  return (
    <div className='system-b-unavailable-page'>
      <div className='system-b-unavailable-content'>
        <svg
          viewBox={JOVIE_ICON_VIEW_BOX}
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
          className='system-b-unavailable-mark'
        >
          <path fill='currentColor' d={JOVIE_ICON_PATH} />
        </svg>

        <h1 className='system-b-unavailable-title'>
          Jovie is unavailable right now
        </h1>

        <p className='system-b-unavailable-copy'>Please try again later.</p>
      </div>
    </div>
  );
}
