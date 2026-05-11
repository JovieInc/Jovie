'use client';

import { Button } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  buildEmailSignature,
  type EmailSignatureInput,
} from '@/lib/email-signature/build-signature';

type CopyKind = 'html' | 'text';

interface EmailSignatureDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly input: EmailSignatureInput | null;
}

function buildPreviewDocument(signatureHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:16px;background:transparent;color:#0d0e12;}img{max-width:100%;}</style></head><body>${signatureHtml}</body></html>`;
}

export function EmailSignatureDialog({
  open,
  onClose,
  input,
}: EmailSignatureDialogProps) {
  const signature = useMemo(
    () => (input ? buildEmailSignature(input) : null),
    [input]
  );
  const previewSrcDoc = useMemo(
    () => (signature ? buildPreviewDocument(signature.html) : null),
    [signature]
  );
  const [recentCopy, setRecentCopy] = useState<CopyKind | null>(null);

  useEffect(() => {
    if (!open) {
      setRecentCopy(null);
      return;
    }
    if (recentCopy === null) return;
    const timeout = setTimeout(() => setRecentCopy(null), 1800);
    return () => clearTimeout(timeout);
  }, [open, recentCopy]);

  const handleCopy = async (kind: CopyKind) => {
    if (!signature) return;
    const payload = kind === 'html' ? signature.html : signature.text;
    const ok = await copyToClipboard(payload);
    if (ok) {
      setRecentCopy(kind);
      toast.success(
        kind === 'html'
          ? 'Email signature copied'
          : 'Plain text signature copied'
      );
    } else {
      toast.error('Failed to copy signature');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size='2xl'>
      <DialogTitle>Email signature</DialogTitle>
      <DialogBody className='space-y-4'>
        <p className='text-xs text-tertiary-token'>
          Paste this into Gmail, Apple Mail, or Outlook. Every email becomes a
          link back to the Jovie profile.
        </p>
        <div className='overflow-hidden rounded-md border border-subtle bg-surface-0'>
          {previewSrcDoc ? (
            <iframe
              data-testid='email-signature-preview'
              title='Email signature preview'
              sandbox=''
              srcDoc={previewSrcDoc}
              className='block h-48 w-full border-0 bg-white'
            />
          ) : (
            <p className='p-4 text-xs text-tertiary-token'>
              Profile data is unavailable. Please retry once the profile loads.
            </p>
          )}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={!signature}
            onClick={() => {
              void handleCopy('text');
            }}
          >
            {recentCopy === 'text' ? (
              <Check className='size-3' />
            ) : (
              <Copy className='size-3' />
            )}
            Copy as plain text
          </Button>
          <Button
            type='button'
            variant='primary'
            size='sm'
            disabled={!signature}
            onClick={() => {
              void handleCopy('html');
            }}
          >
            {recentCopy === 'html' ? (
              <Check className='size-3' />
            ) : (
              <Copy className='size-3' />
            )}
            Copy HTML
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}
