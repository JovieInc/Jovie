'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
            <Input
              id='create-profile-display-name'
              type='text'
              value={displayName}
              onChange={e => {
                setDisplayName(e.target.value);
                setError(null);
              }}
              placeholder='Artist name'
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
            <Input
              id='create-profile-username'
              type='text'
              value={username}
              onChange={e => {
                setUsername(
                  e.target.value.trim().toLowerCase().replaceAll(/\s/g, '-')
                );
                setError(null);
              }}
              placeholder='username'
              disabled={isPending}
            />
          </div>

          {error && (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={isPending || !displayName.trim() || !username.trim()}
            >
              {isPending && <Loader2 className='size-3.5 animate-spin' />}
              Create profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
