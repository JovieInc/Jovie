'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { APP_ROUTES } from '@/constants/routes';

interface DemoShellProps {
  readonly children: ReactNode;
  readonly rightPanel?: ReactNode;
}

const DEMO_NAV_ITEMS = ['Releases', 'Audience', 'Insights', 'Settings'];

export function DemoShell({ children, rightPanel }: Readonly<DemoShellProps>) {
  return (
    <AppShellFrame
      sidebar={
        <aside className='hidden bg-sidebar lg:flex lg:w-[232px] lg:shrink-0 lg:flex-col'>
          <div className='px-3 py-4 text-sm font-medium text-primary-token'>
            Jovie Demo
          </div>
          <nav className='flex flex-1 flex-col gap-1 px-2'>
            {DEMO_NAV_ITEMS.map(item => (
              <button
                key={item}
                type='button'
                className='rounded-md px-2 py-1.5 text-left text-sm text-secondary-token transition hover:bg-elevated hover:text-primary-token'
              >
                {item}
              </button>
            ))}
          </nav>
          <div className='p-3'>
            <Button variant='secondary' size='sm' className='w-full' asChild>
              <a href={APP_ROUTES.SIGNUP}>Start free</a>
            </Button>
          </div>
        </aside>
      }
      header={
        <header className='flex h-12 shrink-0 items-center justify-between border-b border-subtle px-4'>
          <div>
            <p className='text-xs text-tertiary-token'>Product demo</p>
            <p className='text-sm font-medium text-primary-token'>Releases</p>
          </div>
          <Button variant='secondary' size='sm'>
            Invite team
          </Button>
        </header>
      }
      main={children}
      rightPanel={rightPanel}
      isTableRoute
    />
  );
}
