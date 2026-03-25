'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createAdditionalProfile } from '@/app/app/(shell)/dashboard/actions/switch-profile';

interface CreateProfileDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function CreateProfileDialog({
  open,
  onOpenChange,
}: CreateProfileDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    onOpenChange(false);
    setDisplayName('');
    setUsername('');
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    startTransition(async () => {
      const result = await createAdditionalProfile({
        displayName: displayName.trim(),
        username: username.trim(),
      });

      if (!result.success) {
        setError(result.error ?? "Couldn't create profile. Try again.");
        return;
      }

      toast.success('Profile created');
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-[400px]'>
        <DialogHeader>
          <DialogTitle>Add artist profile</DialogTitle>
          <DialogDescription>
            Create a new artist profile you can switch between from the sidebar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <label
              htmlFor='create-profile-display-name'
              className='text-sm font-medium'
            >
              Display name
            </label>
            <input
              id='create-profile-display-name'
              type='text'
              value={displayName}
              onChange={e => {
                setDisplayName(e.target.value);
                setError(null);
              }}
              placeholder='Artist name'
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              autoFocus
              disabled={isPending}
            />
          </div>

          <div className='space-y-2'>
            <label
              htmlFor='create-profile-username'
              className='text-sm font-medium'
            >
              Username
            </label>
            <input
              id='create-profile-username'
              type='text'
              value={username}
              onChange={e => {
                setUsername(
                  e.target.value.toLowerCase().replaceAll(/\s/g, '-')
                );
                setError(null);
              }}
              placeholder='username'
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              disabled={isPending}
            />
          </div>

          {error && (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          )}

          <DialogFooter>
            <button
              type='button'
              onClick={handleClose}
              className='inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type='submit'
              className='inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50'
              disabled={isPending || !displayName.trim() || !username.trim()}
            >
              {isPending && <Loader2 className='size-3.5 animate-spin' />}
              Create profile
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
