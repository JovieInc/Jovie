'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@jovie/ui';
import { Pencil } from 'lucide-react';
import { useState, useTransition } from 'react';
import { updateCreatorAvatarAsAdmin } from '@/app/admin/actions';
import { Avatar } from '@/components/atoms/Avatar';
import AvatarUploader from '@/components/dashboard/molecules/AvatarUploader';

export interface CreatorAvatarCellProps {
  profileId: string;
  username: string;
  avatarUrl: string | null;
}

export function CreatorAvatarCell({
  profileId,
  username,
  avatarUrl,
}: CreatorAvatarCellProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    avatarUrl ?? null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleUploaded = (url: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await updateCreatorAvatarAsAdmin(profileId, url);
        setPreviewUrl(url);
      } catch (err) {
        console.error('Failed to update creator avatar as admin', err);
        setError('Failed to update avatar. Please try again.');
      }
    });
  };

  const handleAvatarDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    setDroppedFile(file);
    setIsOpen(true);
  };

  const handleAvatarDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setDroppedFile(null);
    }
  };

  return (
    <div className='flex items-center gap-2'>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <button
            type='button'
            aria-label={`Change avatar for @${username}`}
            onDragOver={handleAvatarDragOver}
            onDrop={handleAvatarDrop}
            className='group relative inline-flex items-center justify-center focus-ring-transparent-offset'
          >
            <Avatar
              src={previewUrl}
              alt={`Avatar for @${username}`}
              name={username}
              size='sm'
              className='border border-subtle bg-surface-2'
            />
            <div className='pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
              <Pencil className='h-3 w-3 text-white' aria-hidden='true' />
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Update avatar</DialogTitle>
          </DialogHeader>
          <AvatarUploader
            initialUrl={previewUrl ?? undefined}
            autoStartFile={droppedFile}
            onStatusChange={result => {
              if (result.status === 'completed') {
                const url = result.mediumUrl || result.blobUrl;
                if (url) {
                  handleUploaded(url);
                }
              }
            }}
          />
          {error && (
            <p className='mt-2 text-sm text-destructive-token'>{error}</p>
          )}
          <div className='mt-4 flex justify-end'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => handleOpenChange(false)}
              loading={isPending}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
