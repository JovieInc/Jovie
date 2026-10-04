'use client';

// @coverage-via apps/web/tests/unit/components/organisms/ProfileSwitcher.test.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { toast } from '@/components/feedback';
import { Avatar } from '@/components/molecules/Avatar';
import { SHELL_RAIL_LABEL } from '@/components/shell/rail-motion';
import { cn } from '@/lib/utils';
import { CreateIdentityDialog } from './CreateProfileDialog';

interface SwitchIdentityResult {
  success: boolean;
  error?: string;
}

export function IdentitySwitcher() {
  const { identities, activeIdentity } = useDashboardData();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [switchingIdentityId, setSwitchingIdentityId] = useState<string | null>(
    null
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (identities.length < 2 && !showCreateDialog) {
    return null;
  }

  function handleSwitch(identityId: string) {
    if (identityId === activeIdentity?.id) return;
    setSwitchingIdentityId(identityId);
    startTransition(async () => {
      let result: SwitchIdentityResult;
      try {
        const response = await fetch('/api/dashboard/profile/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: identityId }),
        });
        result = (await response.json()) as SwitchIdentityResult;
      } catch {
        setSwitchingIdentityId(null);
        toast.error("Couldn't switch identity. Try again.");
        return;
      }

      setSwitchingIdentityId(null);
      if (!result.success) {
        toast.error(result.error ?? "Couldn't switch identity. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            aria-label='Switch Identity'
            className={cn(
              'flex h-7 w-full items-center gap-1.5 rounded-full px-2 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:bg-sidebar-accent/60',
              'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
            )}
          >
            <Avatar
              src={activeIdentity?.avatarUrl}
              alt={activeIdentity?.displayName ?? ''}
              size='xs'
              name={
                activeIdentity?.displayName ||
                activeIdentity?.username ||
                'Select identity'
              }
              className='shrink-0'
            />
            <span
              className={cn(
                'truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
                SHELL_RAIL_LABEL
              )}
            >
              {activeIdentity?.displayName || 'Select identity'}
            </span>
            <ChevronDown
              className='size-2.5 shrink-0 text-sidebar-item-icon group-data-[collapsible=icon]:hidden'
              aria-hidden='true'
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' sideOffset={4} className='w-55'>
          {identities.map(identity => {
            const isActive = identity.id === activeIdentity?.id;
            const isSwitching = switchingIdentityId === identity.id;
            return (
              <DropdownMenuItem
                key={identity.id}
                onSelect={() => handleSwitch(identity.id)}
                disabled={isPending}
              >
                <Avatar
                  src={identity.avatarUrl}
                  alt={identity.displayName ?? ''}
                  name={identity.displayName || identity.username}
                  size='sm'
                  className='shrink-0'
                />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>
                    {identity.displayName || identity.username}
                  </p>
                  {identity.username && identity.displayName && (
                    <p className='truncate text-xs text-muted-foreground'>
                      @{identity.username}
                    </p>
                  )}
                </div>
                {(() => {
                  if (isSwitching)
                    return (
                      <Loader2 className='size-3.5 shrink-0 animate-spin text-muted-foreground' />
                    );
                  if (isActive)
                    return <Check className='size-3.5 shrink-0 text-primary' />;
                  return null;
                })()}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShowCreateDialog(true)}>
            <Plus className='mr-2 size-3.5' />
            Add Artist Identity
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateIdentityDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </>
  );
}
