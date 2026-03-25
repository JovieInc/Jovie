'use client';

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
import { toast } from 'sonner';
import { switchActiveProfile } from '@/app/app/(shell)/dashboard/actions/switch-profile';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { Avatar } from '@/components/molecules/Avatar';
import { cn } from '@/lib/utils';
import { CreateProfileDialog } from './CreateProfileDialog';

export function ProfileSwitcher() {
  const { creatorProfiles, selectedProfile } = useDashboardData();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(
    null
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (creatorProfiles.length < 2 && !showCreateDialog) {
    return null;
  }

  function handleSwitch(profileId: string) {
    if (profileId === selectedProfile?.id) return;
    setSwitchingProfileId(profileId);
    startTransition(async () => {
      const result = await switchActiveProfile(profileId);
      setSwitchingProfileId(null);
      if (!result.success) {
        toast.error(result.error ?? "Couldn't switch profile. Try again.");
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
            aria-label='Switch artist profile'
            className={cn(
              'flex h-7 w-full items-center gap-1.5 rounded-full px-2 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:bg-sidebar-accent/60',
              'group-data-[collapsible=icon]:justify-center'
            )}
          >
            <Avatar
              src={selectedProfile?.avatarUrl}
              alt={selectedProfile?.displayName ?? ''}
              size='xs'
              className='size-[18px] shrink-0 rounded-full'
            />
            <span className='truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground/78 group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
              {selectedProfile?.displayName || 'Select profile'}
            </span>
            <ChevronDown
              className='size-2.5 shrink-0 text-sidebar-item-icon/55 group-data-[collapsible=icon]:hidden'
              aria-hidden='true'
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' sideOffset={4} className='w-[220px]'>
          {creatorProfiles.map(profile => {
            const isActive = profile.id === selectedProfile?.id;
            const isSwitching = switchingProfileId === profile.id;
            return (
              <DropdownMenuItem
                key={profile.id}
                onSelect={() => handleSwitch(profile.id)}
                disabled={isPending}
                className='flex items-center gap-2'
              >
                <Avatar
                  src={profile.avatarUrl}
                  alt={profile.displayName ?? ''}
                  size='xs'
                  className='size-5 shrink-0 rounded-full'
                />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>
                    {profile.displayName || profile.username}
                  </p>
                  {profile.username && profile.displayName && (
                    <p className='truncate text-xs text-muted-foreground'>
                      @{profile.username}
                    </p>
                  )}
                </div>
                {isSwitching && (
                  <Loader2 className='size-3.5 shrink-0 animate-spin text-muted-foreground' />
                )}
                {!isSwitching && isActive && (
                  <Check className='size-3.5 shrink-0 text-primary' />
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShowCreateDialog(true)}>
            <Plus className='mr-2 size-3.5' />
            Add artist profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProfileDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </>
  );
}
