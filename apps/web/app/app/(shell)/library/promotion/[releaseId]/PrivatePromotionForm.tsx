'use client';

import { Button } from '@jovie/ui';
import { useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';

type PromotionProps = Readonly<{
  profileId: string;
  releaseId: string;
  title: string;
  destination: string;
}>;

export function PrivatePromotionForm({ profileId, releaseId, title, destination }: PromotionProps) {
  const [copy, setCopy] = useState(`Take another listen to “${title}”. What stands out to you this time?\n\n${destination}`);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const captureKey = useRef<string | null>(null);
  const saving = useRef(false);

  async function save() {
    if (saving.current || !copy.trim()) return;
    saving.current = true;
    captureKey.current ??= globalThis.crypto.randomUUID();
    setStatus('saving');
    try {
      const response = await fetch('/api/library/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `Promotion for ${title}`.slice(0, 160),
          body: copy,
          idempotencyKey: captureKey.current,
          catalogSelection: { profileId, releaseId },
        }),
      });
      if (!response.ok) throw new Error('Private save failed');
      const saved = await response.json() as { documentId: string };
      globalThis.location.assign(`${APP_ROUTES.LIBRARY}?document=${encodeURIComponent(saved.documentId)}`);
    } catch {
      setStatus('error');
    } finally {
      saving.current = false;
    }
  }

  return (
    <section className='mx-auto flex w-full max-w-2xl flex-col gap-4 p-4'>
      <h1 className='text-xl font-medium'>Draft a promotion for {title}</h1>
      <label htmlFor='promotion-copy'>What would you like someone to notice on this listen?</label>
      <textarea
        id='promotion-copy'
        className='min-h-40 rounded-md border border-subtle bg-surface-1 p-3'
        value={copy}
        disabled={status === 'saving'}
        onChange={event => setCopy(event.target.value)}
      />
      <Button onClick={() => void save()} disabled={!copy.trim() || status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Save private draft'}
      </Button>
      {status === 'error' ? <p role='alert'>Save could not be confirmed. Retry to reopen the saved version.</p> : null}
    </section>
  );
}
