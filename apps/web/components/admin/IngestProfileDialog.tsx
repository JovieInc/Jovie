'use client';

import { Button, Input } from '@jovie/ui';
import { useState } from 'react';

import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
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

    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/creator-ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: { id: string; username: string };
        links?: number;
      };

      if (!response.ok || !data.ok) {
        const errorMessage = data.error || 'Failed to ingest profile';
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setUrl('');

      // Close dialog after a brief delay and refresh table
      setTimeout(() => {
        onOpenChange(false);
        onSuccess();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to ingest profile';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
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
