'use client';

import { Button, Input } from '@jovie/ui';
import { useEffect, useState } from 'react';

import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import { useIngestProfileMutation } from '@/lib/queries/useIngestProfileMutation';

interface IngestProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function IngestProfileDialog({
  open,
  onOpenChange,
  onSuccess,
}: IngestProfileDialogProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { mutate: ingestProfile, isPending: isLoading } =
    useIngestProfileMutation();

  const isValidLinktreeUrl = (input: string): boolean => {
    try {
      const parsed = new URL(input);
      return (
        parsed.hostname === 'linktr.ee' ||
        parsed.hostname === 'www.linktr.ee' ||
        parsed.hostname === 'linktree.com' ||
        parsed.hostname === 'www.linktree.com'
      );
    } catch {
      return false;
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setUrl('');
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!url.trim()) {
      setError('Please enter a Linktree URL');
      return;
    }

    if (!isValidLinktreeUrl(url)) {
      setError('Please enter a valid Linktree URL (linktr.ee or linktree.com)');
      return;
    }

    ingestProfile(
      { url: url.trim() },
      {
        onSuccess: () => {
          setSuccess(true);
          setUrl('');

          // Close dialog after a brief delay and refresh table
          setTimeout(() => {
            onOpenChange(false);
            onSuccess();
            setSuccess(false);
          }, 1500);
        },
        onError: err => {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to ingest profile';
          setError(errorMessage);
        },
      }
    );
  };

  const handleClose = () => {
    if (!isLoading) {
      setUrl('');
      setError(null);
      setSuccess(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size='md'>
      <DialogTitle>Ingest Linktree Profile</DialogTitle>
      <DialogBody>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <label
              htmlFor='linktree-url'
              className='text-sm font-medium text-primary-token'
            >
              Linktree URL
            </label>
            <Input
              id='linktree-url'
              type='url'
              placeholder='https://linktr.ee/username'
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setUrl(e.target.value)
              }
              disabled={isLoading}
              autoFocus
              className='w-full'
            />
            <p className='text-xs text-secondary-token'>
              Enter a Linktree URL to create a new creator profile
            </p>
          </div>

          {error && (
            <div className='p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20'>
              {error}
            </div>
          )}

          {success && (
            <div className='p-3 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800'>
              Profile ingested successfully!
            </div>
          )}

          <div className='flex gap-3 justify-end pt-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              loading={isLoading}
              disabled={isLoading || success}
            >
              {isLoading ? 'Ingesting...' : 'Ingest'}
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  );
}
