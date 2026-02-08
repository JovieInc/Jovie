'use client';

import { Button } from '@jovie/ui';
import {
  Calendar,
  Check,
  Disc3,
  Mail,
  Megaphone,
  Music,
  Tag,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ReleaseProposal {
  title: string;
  releaseType: string;
  releaseDate?: string;
  announcementDate?: string;
  totalTracks?: number;
  label?: string;
  isExplicit?: boolean;
  upc?: string;
  isrc?: string;
  releaseDayEmailEnabled?: boolean;
  announceEmailEnabled?: boolean;
}

interface ReleaseProposalCardProps {
  readonly proposal: ReleaseProposal;
  readonly onConfirm: (proposal: ReleaseProposal) => void;
  readonly onCancel: () => void;
  readonly isConfirming?: boolean;
}

function formatReleaseType(type: string): string {
  const labels: Record<string, string> = {
    single: 'Single',
    ep: 'EP',
    album: 'Album',
    compilation: 'Compilation',
    live: 'Live',
    mixtape: 'Mixtape',
    other: 'Other',
  };
  return labels[type] ?? type;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'Not set';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function ReleaseProposalCard({
  proposal,
  onConfirm,
  onCancel,
  isConfirming = false,
}: ReleaseProposalCardProps) {
  const [releaseDayEmail, setReleaseDayEmail] = useState(
    proposal.releaseDayEmailEnabled ?? true
  );
  const [announceEmail, setAnnounceEmail] = useState(
    proposal.announceEmailEnabled ?? false
  );

  const handleConfirm = useCallback(() => {
    onConfirm({
      ...proposal,
      releaseDayEmailEnabled: releaseDayEmail,
      announceEmailEnabled: announceEmail,
    });
  }, [proposal, releaseDayEmail, announceEmail, onConfirm]);

  return (
    <div className='w-full max-w-sm rounded-xl border border-border bg-surface-1 p-4'>
      {/* Header */}
      <div className='mb-3 flex items-center gap-2'>
        <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10'>
          <Disc3 className='h-4 w-4 text-accent' />
        </div>
        <span className='text-sm font-semibold text-primary-token'>
          New Release
        </span>
      </div>

      {/* Fields */}
      <div className='space-y-2 text-sm'>
        <div className='flex items-center gap-2'>
          <Music className='h-3.5 w-3.5 text-tertiary-token' />
          <span className='text-secondary-token'>Title:</span>
          <span className='font-medium text-primary-token'>
            {proposal.title}
          </span>
        </div>

        <div className='flex items-center gap-2'>
          <Tag className='h-3.5 w-3.5 text-tertiary-token' />
          <span className='text-secondary-token'>Type:</span>
          <span className='font-medium text-primary-token'>
            {formatReleaseType(proposal.releaseType)}
          </span>
        </div>

        <div className='flex items-center gap-2'>
          <Calendar className='h-3.5 w-3.5 text-tertiary-token' />
          <span className='text-secondary-token'>Release:</span>
          <span className='font-medium text-primary-token'>
            {formatDate(proposal.releaseDate)}
          </span>
        </div>

        {proposal.announcementDate && (
          <div className='flex items-center gap-2'>
            <Megaphone className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>Announce:</span>
            <span className='font-medium text-primary-token'>
              {formatDate(proposal.announcementDate)}
            </span>
          </div>
        )}

        {proposal.totalTracks && proposal.totalTracks > 0 && (
          <div className='flex items-center gap-2'>
            <Disc3 className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>Tracks:</span>
            <span className='font-medium text-primary-token'>
              {proposal.totalTracks}
            </span>
          </div>
        )}

        {proposal.label && (
          <div className='flex items-center gap-2'>
            <Tag className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>Label:</span>
            <span className='font-medium text-primary-token'>
              {proposal.label}
            </span>
          </div>
        )}

        {proposal.upc && (
          <div className='flex items-center gap-2'>
            <Tag className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>UPC:</span>
            <span className='font-mono text-xs text-primary-token'>
              {proposal.upc}
            </span>
          </div>
        )}

        {proposal.isrc && (
          <div className='flex items-center gap-2'>
            <Tag className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>ISRC:</span>
            <span className='font-mono text-xs text-primary-token'>
              {proposal.isrc}
            </span>
          </div>
        )}
      </div>

      {/* Email toggles */}
      <div className='mt-3 space-y-2 border-t border-border pt-3'>
        {proposal.releaseDate && (
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={releaseDayEmail}
              onChange={e => setReleaseDayEmail(e.target.checked)}
              className='h-4 w-4 rounded border-border'
            />
            <Mail className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>
              Email fans on release day
            </span>
          </label>
        )}

        {proposal.announcementDate && (
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={announceEmail}
              onChange={e => setAnnounceEmail(e.target.checked)}
              className='h-4 w-4 rounded border-border'
            />
            <Megaphone className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='text-secondary-token'>
              Email fans on announcement
            </span>
          </label>
        )}
      </div>

      {/* Actions */}
      <div className='mt-3 flex gap-2'>
        <Button
          variant='primary'
          size='sm'
          onClick={handleConfirm}
          disabled={isConfirming}
          className={cn('flex-1 gap-1.5', isConfirming && 'opacity-70')}
        >
          <Check className='h-3.5 w-3.5' />
          {isConfirming ? 'Creating...' : 'Confirm'}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={onCancel}
          disabled={isConfirming}
          className='gap-1.5'
        >
          <X className='h-3.5 w-3.5' />
          Cancel
        </Button>
      </div>
    </div>
  );
}
