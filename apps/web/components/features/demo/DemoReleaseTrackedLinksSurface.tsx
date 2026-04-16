'use client';

import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import type {
  ContextMenuItemType,
  ContextMenuSubmenu,
} from '@/components/organisms/table/molecules/TableContextMenu';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { DemoAuthShell } from './DemoAuthShell';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

function isSubmenu(item: ContextMenuItemType): item is ContextMenuSubmenu {
  return 'items' in item && Array.isArray(item.items);
}

function getTrackedLinksMenuItems() {
  const release = DEMO_RELEASE_VIEW_MODELS[0];
  const actions = buildReleaseActions({
    release,
    artistName: release.artistNames?.[0] ?? null,
    onEdit: () => {},
    onCopy: async (path: string) => path,
  });

  const shareMenu = actions.find(
    item => isSubmenu(item) && item.id === 'share-link'
  );
  if (!shareMenu || !isSubmenu(shareMenu)) {
    return [];
  }

  const trackedMenu = shareMenu.items.find(
    item => isSubmenu(item) && item.id === 'tracked-share-submenu'
  );

  return trackedMenu && isSubmenu(trackedMenu) ? trackedMenu.items : [];
}

export function DemoReleaseTrackedLinksSurface() {
  const release = DEMO_RELEASE_VIEW_MODELS[0];
  const trackedLinksItems = getTrackedLinksMenuItems();

  return (
    <DemoAuthShell>
      <AppShellContentPanel
        maxWidth='wide'
        frame='none'
        contentPadding='none'
        scroll='page'
        data-testid='demo-showcase-release-tracked-links'
      >
        <section className='overflow-hidden px-4 py-4 sm:px-5 sm:py-5'>
          <div
            className='mx-auto max-w-[920px] rounded-[22px] border border-subtle bg-surface-0 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]'
            data-testid='demo-release-tracked-links-capture'
          >
            <div className='rounded-[18px] border border-subtle bg-surface-1 px-4 py-3'>
              <p className='text-[11px] font-[510] tracking-[-0.01em] text-tertiary-token'>
                Release row
              </p>
              <div className='mt-2 flex items-center justify-between gap-4'>
                <div>
                  <p className='text-[14px] font-[560] text-primary-token'>
                    {release.title}
                  </p>
                  <p className='text-[12px] text-secondary-token'>
                    {release.artistNames?.join(', ') ?? 'Unknown artist'}
                  </p>
                </div>
                <div className='rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-[12px] font-[510] text-secondary-token'>
                  Share link
                </div>
              </div>
            </div>

            <div className='relative mt-6 h-[320px]'>
              <div className='absolute left-0 top-0 w-[270px] rounded-[18px] border border-subtle bg-surface-0 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.32)]'>
                <div className='rounded-[14px] bg-surface-1 px-3 py-2 text-[12px] font-[560] text-primary-token'>
                  Share link
                </div>
                <div className='mt-2 rounded-[14px] bg-[color-mix(in_oklab,var(--linear-row-selected)_14%,transparent)] px-3 py-2 text-[12px] font-[560] text-primary-token'>
                  Tracked Links
                </div>
              </div>

              <div className='absolute left-[238px] top-7 w-[340px] rounded-[18px] border border-subtle bg-surface-0 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.32)]'>
                <div className='rounded-[14px] bg-surface-1 px-3 py-2 text-[12px] font-[560] text-primary-token'>
                  Tracked Links
                </div>
                <div className='mt-2 space-y-1'>
                  {trackedLinksItems.map(item => {
                    if (!isSubmenu(item)) {
                      return null;
                    }

                    return (
                      <div
                        key={item.id}
                        className='flex items-center justify-between rounded-[14px] px-3 py-2 text-[12px] text-secondary-token'
                      >
                        <div className='flex items-center gap-2'>
                          <span className='text-tertiary-token'>
                            {item.icon}
                          </span>
                          <span className='font-[510] text-primary-token'>
                            {item.label}
                          </span>
                        </div>
                        <span className='text-tertiary-token'>
                          {item.items.length} presets
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </AppShellContentPanel>
    </DemoAuthShell>
  );
}
