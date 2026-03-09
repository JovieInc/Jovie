'use client';

import { Button } from '@jovie/ui';
import { Check, Copy, ExternalLink, Loader2, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface DmQueueLead {
  id: string;
  displayName: string | null;
  instagramHandle: string | null;
  priorityScore: number | null;
  dmCopy: string | null;
  outreachStatus: string;
}

interface DmQueueCardProps {
  readonly lead: DmQueueLead;
  readonly onMarkedSent: () => void;
}

export function DmQueueCard({ lead, onMarkedSent }: DmQueueCardProps) {
  const [marking, setMarking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);

  async function handleCopy() {
    if (!lead.dmCopy) return;
    try {
      await navigator.clipboard.writeText(lead.dmCopy);
      setCopied(true);
      toast.success('DM copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  async function handleMarkSent() {
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/dm-sent`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Failed to mark as sent');
      setMarkedDone(true);
      toast.success('Marked as DM sent');
      onMarkedSent();
    } catch {
      toast.error('Failed to mark as sent');
    } finally {
      setMarking(false);
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

      {lead.dmCopy && (
        <textarea
          readOnly
          value={lead.dmCopy}
          rows={4}
          className='w-full resize-none rounded-md border border-subtle bg-background px-3 py-2 text-xs text-secondary-token'
        />
      )}

      <div className='flex gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void handleCopy()}
          disabled={!lead.dmCopy || markedDone}
        >
          {copied ? (
            <Check className='mr-1.5 size-3.5' />
          ) : (
            <Copy className='mr-1.5 size-3.5' />
          )}
          {copied ? 'Copied' : 'Copy DM'}
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={() => void handleMarkSent()}
          disabled={marking || markedDone}
        >
          {marking ? (
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
