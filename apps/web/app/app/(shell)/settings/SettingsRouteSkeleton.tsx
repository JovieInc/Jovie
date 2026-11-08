import SettingsLayout from './layout';

const SETTINGS_FIELD_ROW_KEYS = [
  'settings-field-1',
  'settings-field-2',
  'settings-field-3',
] as const;

/**
 * First-boot fallback for /app/settings/* (and /app/earnings, which
 * redirects into settings), rendered inside the real `SettingsLayout`,
 * with one section header and three field rows, so the section header does
 * not move when the page arrives.
 */
export function SettingsRouteSkeleton() {
  return (
    <SettingsLayout>
      <output
        className='block'
        aria-busy='true'
        aria-label='Loading Settings'
        aria-live='polite'
        data-testid='settings-route-skeleton'
      >
        <section aria-hidden='true' className='scroll-mt-6'>
          <div
            className='flex min-h-10 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-subtle/80 px-3 py-1.5'
            data-skeleton-slot='settings-section-header'
          >
            <div className='min-w-0 flex-1 space-y-1'>
              <div className='skeleton h-4 w-24 rounded-sm' />
              <div className='skeleton h-3 w-56 max-w-full rounded-sm max-sm:hidden' />
            </div>
          </div>
          <div className='space-y-4 px-(--app-shell-content-padding-x) py-(--app-shell-content-padding-y)'>
            {SETTINGS_FIELD_ROW_KEYS.map(key => (
              <div
                key={key}
                className='flex items-center justify-between gap-4 rounded-xl bg-surface-0 px-3 py-2.5'
              >
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <div className='skeleton h-4 w-40 max-w-full rounded-sm' />
                  <div className='skeleton h-3 w-64 max-w-full rounded-sm' />
                </div>
                <div className='skeleton h-8 w-20 shrink-0 rounded-full' />
              </div>
            ))}
          </div>
        </section>
      </output>
    </SettingsLayout>
  );
}
