'use client';

import { Button } from '@jovie/ui';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useMarkLeadDmSentMutation } from '@/lib/queries';

export interface DmQueueLead {
  id: string;
  displayName: string | null;
  instagramHandle: string | null;
  priorityScore: number | null;
  dmCopy: string | null;
  dmOpener: string | null;
  claimToken: string | null;
  outreachStatus: string;
}

interface DmQueueCardProps {
  readonly lead: DmQueueLead;
  readonly onMarkedSent: () => void;
  readonly onSendDm?: () => void;
}

export function DmQueueCard({
  lead,
  onMarkedSent,
  onSendDm,
}: DmQueueCardProps) {
  const [copied, setCopied] = useState(false);
  const [claimCopied, setClaimCopied] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);
  const markDmSentMutation = useMarkLeadDmSentMutation();

  const openerText = lead.dmOpener ?? lead.dmCopy;

  async function handleSendDm() {
    if (!lead.instagramHandle || !openerText) return;
    try {
      await navigator.clipboard.writeText(openerText);
      toast.success('DM copied — opening Instagram');
    } catch {
      toast.error('Copy failed — opening Instagram anyway');
    }
    window.open(
      `https://ig.me/m/${lead.instagramHandle}`,
      '_blank',
      'noopener,noreferrer'
    );
    onSendDm?.();
  }

  async function handleCopy() {
    if (!openerText) return;
    try {
      await navigator.clipboard.writeText(openerText);
      setCopied(true);
      toast.success('DM copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  async function handleCopyClaimLink() {
    if (!lead.claimToken) return;
    const claimUrl = `${window.location.origin}/claim/${lead.claimToken}`;
    try {
      await navigator.clipboard.writeText(claimUrl);
      setClaimCopied(true);
      toast.success('Claim link copied — send after they reply');
      setTimeout(() => setClaimCopied(false), 2000);
    } catch {
      toast.error('Failed to copy claim link');
    }
  }

  async function handleMarkSent() {
    try {
      await markDmSentMutation.mutateAsync(lead.id);
      setMarkedDone(true);
      toast.success('Marked as DM sent');
      onMarkedSent();
    } catch {
      toast.error('Failed to mark as sent');
    }
  }

  return (
    <div
      className={`rounded-lg border border-subtle p-4 space-y-3 ${
        markedDone ? 'opacity-50' : ''
      }`}
    >
      <div className='flex items-start justify-between'>
        <div className='flex items-center gap-3'>
          <div className='flex size-10 items-center justify-center rounded-full bg-surface-2'>
            <User className='size-5 text-tertiary-token' />
          </div>
          <div>
            <p className='text-sm font-medium text-primary-token'>
              {lead.displayName || 'Unknown'}
            </p>
            {lead.instagramHandle && (
              <a
                href={`https://instagram.com/${lead.instagramHandle}`}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center gap-1 text-xs text-secondary-token hover:text-primary-token'
              >
                @{lead.instagramHandle}
                <ExternalLink className='size-3' />
              </a>
            )}
          </div>
        </div>
        {lead.priorityScore != null && (
          <span className='rounded-md bg-surface-2 px-2 py-1 text-xs font-medium tabular-nums text-secondary-token'>
            Score: {lead.priorityScore}
          </span>
        )}
      </div>

      {openerText && (
        <textarea
          readOnly
          value={openerText}
          rows={4}
          className='w-full resize-none rounded-md border border-subtle bg-background px-3 py-2 text-sm sm:text-xs text-secondary-token'
        />
      )}

      {/* Primary action: Send DM (copy opener + open Instagram DM) */}
      <Button
        variant='accent'
        size='lg'
        className='w-full'
        onClick={() => void handleSendDm()}
        disabled={!lead.instagramHandle || !openerText || markedDone}
      >
        <Send className='mr-1.5 size-4' />
        Send DM
      </Button>

      {/* Secondary actions */}
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void handleCopy()}
          disabled={!openerText || markedDone}
        >
          {copied ? (
            <Check className='mr-1.5 size-3.5' />
          ) : (
            <Copy className='mr-1.5 size-3.5' />
          )}
          {copied ? 'Copied' : 'Copy DM'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void handleCopyClaimLink()}
          disabled={!lead.claimToken || markedDone}
        >
          {claimCopied ? (
            <Check className='mr-1.5 size-3.5' />
          ) : (
            <Link2 className='mr-1.5 size-3.5' />
          )}
          {claimCopied ? 'Copied' : 'Claim Link'}
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={() => void handleMarkSent()}
          disabled={markDmSentMutation.isPending || markedDone}
        >
          {markDmSentMutation.isPending ? (
            <Loader2 className='mr-1.5 size-3.5 animate-spin' />
          ) : (
            <Check className='mr-1.5 size-3.5' />
          )}
          {markedDone ? 'Sent' : "Mark as DM'd"}
        </Button>
      </div>
    </div>
  );
}
