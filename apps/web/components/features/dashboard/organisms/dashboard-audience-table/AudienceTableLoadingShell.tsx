import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageToolbar } from '@/components/organisms/table';

const AUDIENCE_LOADING_TAB_KEYS = ['all', 'identified', 'anonymous'] as const;
const AUDIENCE_TABLE_HEADER_KEYS = Array.from(
  { length: 7 },
  (_, i) => `audience-header-${i + 1}`
);
const AUDIENCE_TABLE_ROW_KEYS = Array.from(
  { length: 10 },
  (_, i) => `audience-row-${i + 1}`
);
const AUDIENCE_TABLE_COL_KEYS = Array.from(
  { length: 7 },
  (_, i) => `audience-col-${i + 1}`
);
const AUDIENCE_MOBILE_ROW_KEYS = Array.from(
  { length: 8 },
  (_, i) => `audience-mobile-${i + 1}`
);

export function AudienceTableLoadingShell() {
  return (
    <div className='flex h-full min-h-0 flex-col' aria-busy='true'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-32'
        actionWidths={['w-8', 'w-8']}
        className='bg-(--linear-app-content-surface)'
      />

      <PageToolbar
        start={
          <div className='flex flex-wrap items-center gap-1'>
            {AUDIENCE_LOADING_TAB_KEYS.map(key => (
              <LoadingSkeleton
                key={key}
                height='h-8'
                width='w-24'
                rounded='md'
              />
            ))}
          </div>
        }
        end={
          <>
            <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
            <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
            <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
            <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
          </>
        }
      />

      <div className='flex-1 min-h-0 overflow-hidden bg-(--linear-app-content-surface)'>
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex-1 min-h-0 overflow-auto sm:hidden'>
            <div className='divide-y divide-(--linear-border-subtle)'>
              {AUDIENCE_MOBILE_ROW_KEYS.map(key => (
                <div key={key} className='flex items-center gap-3 px-4 py-3'>
                  <LoadingSkeleton
                    height='h-9'
                    width='w-9'
                    rounded='full'
                    className='shrink-0'
                  />
                  <div className='flex-1 min-w-0 space-y-1.5'>
                    <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                    <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
                  </div>
                  <LoadingSkeleton
                    height='h-3'
                    width='w-14'
                    rounded='sm'
                    className='shrink-0'
                  />
                </div>
              ))}
            </div>
          </div>

          <div className='hidden flex-1 min-h-0 overflow-auto sm:block'>
            <div className='px-4 py-4 sm:px-6'>
              <div className='overflow-hidden rounded-xl border border-(--linear-border-subtle) bg-(--linear-app-content-surface) shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
                <div className='grid grid-cols-7 gap-4 border-b border-(--linear-border-subtle) px-4 py-3'>
                  {AUDIENCE_TABLE_HEADER_KEYS.map(key => (
                    <LoadingSkeleton
                      key={key}
                      height='h-4'
                      width='w-24'
                      rounded='md'
                    />
                  ))}
                </div>
                <ul>
                  {AUDIENCE_TABLE_ROW_KEYS.map(rowKey => (
                    <li
                      key={rowKey}
                      className='grid grid-cols-7 items-center gap-4 border-b border-(--linear-border-subtle) px-4 last:border-b-0'
                      style={{ height: '44px' }}
                      aria-hidden='true'
                    >
                      {AUDIENCE_TABLE_COL_KEYS.map(colKey => (
                        <LoadingSkeleton
                          key={`${rowKey}-${colKey}`}
                          height='h-4'
                          width='w-full'
                          rounded='md'
                        />
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className='sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-(--linear-border-subtle) bg-(--linear-app-content-surface)/95 px-4 py-2 text-xs text-(--linear-text-secondary) backdrop-blur-md sm:px-6 supports-[backdrop-filter]:bg-(--linear-app-content-surface)/85'>
            <LoadingSkeleton
              height='h-4'
              width='w-48'
              rounded='md'
              className='hidden sm:block'
            />
            <LoadingSkeleton
              height='h-4'
              width='w-24'
              rounded='md'
              className='sm:hidden'
            />
            <div className='flex items-center gap-3'>
              <LoadingSkeleton
                height='h-8'
                width='w-28'
                rounded='md'
                className='hidden sm:block'
              />
              <div className='flex gap-2'>
                <LoadingSkeleton height='h-8' width='w-20' rounded='md' />
                <LoadingSkeleton height='h-8' width='w-16' rounded='md' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
