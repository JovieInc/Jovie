'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@jovie/ui';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import { updateCreatorAvatarAsAdmin } from '@/app/admin/actions';
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
  const [isPending, startTransition] = useTransition();

  const handleUploaded = (url: string) => {
    setPreviewUrl(url);
    startTransition(async () => {
      await updateCreatorAvatarAsAdmin(profileId, url);
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type='button'
          className='inline-flex items-center justify-center'
          aria-label={`Change avatar for @${username}`}
        >
          <div className='relative h-8 w-8 overflow-hidden rounded-full border border-subtle bg-surface-2'>
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt={`Avatar for @${username}`}
                fill
                sizes='32px'
                className='object-cover'
              />
            ) : (
              <Image
                src='/avatars/default-user.png'
                alt={`Avatar for @${username}`}
                fill
                sizes='32px'
                className='object-cover'
              />
            )}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Update avatar</DialogTitle>
        </DialogHeader>
        <AvatarUploader
          initialUrl={previewUrl ?? undefined}
          onStatusChange={result => {
            if (result.status === 'completed') {
              const url = result.mediumUrl || result.blobUrl;
              if (url) {
                handleUploaded(url);
              }
            }
          }}
        />
        <div className='mt-4 flex justify-end'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => setIsOpen(false)}
            loading={isPending}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
