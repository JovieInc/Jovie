import { BrandLogo } from '@/components/atoms/BrandLogo';
import { AppShellFrame } from './AppShellFrame';

const NAV_ITEMS = [
  { key: 'nav-inbox', width: '60%' },
  { key: 'nav-issues', width: '75%' },
  { key: 'nav-views', width: '90%' },
  { key: 'nav-projects', width: '60%' },
  { key: 'nav-cycles', width: '75%' },
  { key: 'nav-teams', width: '90%' },
];

const NAV_ITEMS_2 = [
  { key: 'nav-settings', width: '50%' },
  { key: 'nav-help', width: '70%' },
  { key: 'nav-updates', width: '90%' },
  { key: 'nav-docs', width: '50%' },
];

export function AppShellSkeleton() {
  return (
    <AppShellFrame
      sidebar={
        <div className='hidden bg-sidebar lg:flex lg:w-[232px] lg:shrink-0 lg:flex-col'>
          <div className='flex h-9 items-center gap-2 px-2 pt-2'>
            <div className='skeleton h-6 w-6 rounded-md' />
            <div className='skeleton h-4 w-24 rounded' />
          </div>

          <div className='flex-1 space-y-1 px-2 pt-4'>
            {NAV_ITEMS.map(item => (
              <div
                key={item.key}
                className='flex h-7 items-center gap-2 rounded-[6px] px-1.5'
              >
                <div className='skeleton h-3.5 w-3.5 shrink-0 rounded' />
                <div
                  className='skeleton h-3 rounded'
                  style={{ width: item.width }}
                />
              </div>
            ))}

            <div className='pb-1 pt-3'>
              <div className='skeleton ml-1.5 h-3 w-16 rounded' />
            </div>

            {NAV_ITEMS_2.map(item => (
              <div
                key={item.key}
                className='flex h-7 items-center gap-2 rounded-[6px] px-1.5'
              >
                <div className='skeleton h-3.5 w-3.5 shrink-0 rounded' />
                <div
                  className='skeleton h-3 rounded'
                  style={{ width: item.width }}
                />
              </div>
            ))}
          </div>

          <div className='flex items-center gap-2 px-2 pb-2 pt-1'>
            <div className='skeleton h-7 w-7 shrink-0 rounded-full' />
            <div className='skeleton h-3 w-20 rounded' />
          </div>
        </div>
      }
      header={
        <header className='flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-4'>
          <div className='skeleton h-4 w-20 rounded' />
          <div className='skeleton h-4 w-4 rounded opacity-30' />
          <div className='skeleton h-4 w-28 rounded' />
        </header>
      }
      main={
        <div className='flex h-full items-center justify-center'>
          <div className='flex flex-col items-center gap-3'>
            <BrandLogo
              size={32}
              tone='auto'
              alt='Loading'
              className='opacity-80'
              aria-hidden
            />
            <p className='text-xs text-tertiary-token'>Loading...</p>
          </div>
        </div>
      }
    />
  );
}
