'use client';

import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { cn } from '@/lib/utils';
import { DemoShell } from './DemoShell';
import { runDemoAction } from './demo-actions';
import { DEMO_RELEASES } from './demo-fixtures';
import type { DemoRelease } from './demo-types';

const statusTone: Record<DemoRelease['status'], string> = {
  healthy: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-rose-100 text-rose-800',
  draft: 'bg-slate-100 text-slate-700',
};

export function DemoReleasesExperience() {
  const [selectedId, setSelectedId] = useState<string>(
    DEMO_RELEASES[0]?.id ?? ''
  );
  const selectedRelease = useMemo(
    () => DEMO_RELEASES.find(item => item.id === selectedId) ?? null,
    [selectedId]
  );

  return (
    <DemoShell
      rightPanel={
        <RightDrawer
          isOpen={selectedRelease != null}
          width={360}
          ariaLabel='Release details panel'
        >
          {selectedRelease ? (
            <div className='space-y-4 p-4'>
              <h2 className='text-sm font-semibold text-primary-token'>
                {selectedRelease.title}
              </h2>
              <p className='text-sm text-secondary-token'>
                {selectedRelease.note}
              </p>
              <div className='space-y-2'>
                {selectedRelease.links.map(link => (
                  <div
                    key={link.id}
                    className='rounded-md border border-subtle p-2'
                  >
                    <p className='text-xs font-medium text-primary-token'>
                      {link.provider}
                    </p>
                    <p className='text-xs text-secondary-token capitalize'>
                      {link.status}
                    </p>
                  </div>
                ))}
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <Button
                  size='sm'
                  variant='secondary'
                  onClick={() =>
                    runDemoAction({
                      loadingMessage: 'Syncing providers',
                      successMessage: 'Sync complete. Demo data stays local.',
                    })
                  }
                >
                  Sync
                </Button>
                <Button
                  size='sm'
                  variant='secondary'
                  onClick={() =>
                    runDemoAction({
                      successMessage:
                        'Saved in demo mode. No backend changes were made.',
                    })
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </RightDrawer>
      }
    >
      <div className='min-w-[700px]'>
        <div className='mb-4 flex items-center justify-between'>
          <h1 className='text-xl font-semibold text-primary-token'>
            Release matrix
          </h1>
          <Button
            size='sm'
            onClick={() =>
              runDemoAction({
                loadingMessage: 'Creating draft release',
                successMessage: 'Draft created locally for this demo session.',
              })
            }
          >
            Add release
          </Button>
        </div>
        <div className='overflow-hidden rounded-lg border border-subtle'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-left text-xs uppercase tracking-wide text-tertiary-token'>
              <tr>
                <th className='px-4 py-3'>Release</th>
                <th className='px-4 py-3'>Status</th>
                <th className='px-4 py-3'>Summary</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_RELEASES.map(release => (
                <tr
                  key={release.id}
                  className='cursor-pointer border-t border-subtle transition hover:bg-surface-2'
                  onClick={() => setSelectedId(release.id)}
                >
                  <td className='px-4 py-3'>
                    <p className='font-medium text-primary-token'>
                      {release.title}
                    </p>
                    <p className='text-xs text-secondary-token'>
                      {release.artist} · {release.releaseDate}
                    </p>
                  </td>
                  <td className='px-4 py-3'>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize',
                        statusTone[release.status]
                      )}
                    >
                      {release.status}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-secondary-token'>
                    {release.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DemoShell>
  );
}
