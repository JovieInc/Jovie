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
  Label,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { toast } from '@/components/feedback';

interface CreateProfileResult {
  success: boolean;
  error?: string;
  profileId?: string;
}

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

  function handleSubmit(e: FormEvent) {
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
      let result: CreateProfileResult;
      try {
        const response = await fetch('/api/dashboard/profile/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: displayName.trim(),
            username: username.trim(),
          }),
        });
        result = (await response.json()) as CreateProfileResult;
      } catch {
        setError("Couldn't create profile. Try again.");
        return;
      }

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
      <DialogContent className='sm:max-w-100'>
        <DialogHeader>
          <DialogTitle>Add Artist Profile</DialogTitle>
          <DialogDescription>
            Create a new artist profile you can switch between from the sidebar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='create-profile-display-name'>Display Name</Label>
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
            <Label htmlFor='create-profile-username'>Username</Label>
            <Input
              id='create-profile-username'
              type='text'
              value={username}
              onChange={e => {
                setUsername(
                  e.target.value.toLowerCase().replaceAll(/\s/g, '-')
                );
                setError(null);
              }}
              placeholder='Username'
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
              onClick={handleClose}
              variant='secondary'
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              loading={isPending}
              disabled={isPending || !displayName.trim() || !username.trim()}
            >
              Create Profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
