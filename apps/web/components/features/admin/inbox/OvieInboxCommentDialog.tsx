'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@jovie/ui';
import { useState } from 'react';
import type { OvieInboxDecision, OvieInboxItem } from '@/lib/ovie/inbox';

export interface OvieInboxCommentDialogProps {
  readonly item: OvieInboxItem | null;
  /** Decision the dialog was opened for; null lets the founder pick. */
  readonly preset: OvieInboxDecision | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (decision: OvieInboxDecision, comment: string) => void;
  readonly onOpenChange: (open: boolean) => void;
}

/** Approve or reject with a note. ⌘/Ctrl+Enter submits the preset or approve. */
export function OvieInboxCommentDialog({
  item,
  preset,
  isSubmitting,
  onSubmit,
  onOpenChange,
}: Readonly<OvieInboxCommentDialogProps>) {
  const [comment, setComment] = useState('');
  const trimmed = comment.trim();
  const rejectNeedsComment = Boolean(item?.rejectRequiresComment);
  const canReject = !isSubmitting && (!rejectNeedsComment || trimmed !== '');
  const canApprove = !isSubmitting && preset !== 'reject';

  function submit(decision: OvieInboxDecision) {
    if (decision === 'reject' ? !canReject : !canApprove) return;
    onSubmit(decision, trimmed);
    setComment('');
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={open => {
        if (!open) setComment('');
        onOpenChange(open);
      }}
    >
      <DialogContent className='max-w-md' data-testid='ovie-inbox-comment'>
        <DialogHeader>
          <DialogTitle>
            {preset === 'reject' ? 'Reject With Comment' : 'Comment'}
          </DialogTitle>
          <DialogDescription>{item?.title}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={comment}
          onChange={event => setComment(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit(preset ?? 'approve');
            }
          }}
          placeholder={
            rejectNeedsComment
              ? 'Direction for the next pass'
              : 'Optional note for Summer'
          }
          aria-label='Comment'
          rows={4}
          maxLength={2000}
        />
        <DialogFooter>
          <Button
            variant='secondary'
            disabled={!canReject}
            onClick={() => submit('reject')}
          >
            Reject
          </Button>
          {preset === 'reject' ? null : (
            <Button disabled={!canApprove} onClick={() => submit('approve')}>
              Approve
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
