'use client';

import { Button } from '@jovie/ui';
import { useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  composePromotion,
  type PromotionContext,
} from '@/lib/creator-documents/promotion-copy';

type PromotionProps = Readonly<{
  profileId: string;
  releaseId: string;
  title: string;
  context: PromotionContext;
}>;

export function PrivatePromotionForm({
  profileId,
  releaseId,
  title,
  context,
}: PromotionProps) {
  const [angle, setAngle] = useState('');
  const [copy, setCopy] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const captureKey = useRef<string | null>(null);
  const saving = useRef(false);

  async function save() {
    if (saving.current || !copy?.trim()) return;
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
      const saved = (await response.json()) as { documentId: string };
      globalThis.location.assign(
        `${APP_ROUTES.LIBRARY}?document=${encodeURIComponent(saved.documentId)}`
      );
    } catch {
      setStatus('error');
    } finally {
      saving.current = false;
    }
  }

  return (
    <section className='mx-auto flex w-full max-w-2xl flex-col gap-4 p-4'>
      <h1 className='line-clamp-2 text-xl font-medium'>
        Draft a promotion for {title}
      </h1>
      {copy === null && (
        <>
          <label htmlFor='promotion-angle'>
            What inspired this work, or what detail should someone notice?
          </label>
          <textarea
            id='promotion-angle'
            value={angle}
            onChange={event => setAngle(event.target.value)}
          />
          <Button
            disabled={!angle.trim()}
            onClick={() => setCopy(composePromotion(title, angle, context))}
          >
            Prepare caption
          </Button>
        </>
      )}
      {copy !== null && (
        <>
          <label htmlFor='promotion-copy'>Edit your caption</label>
          <textarea
            id='promotion-copy'
            className='min-h-40 rounded-md border border-subtle bg-surface-1 p-3'
            value={copy}
            disabled={status !== 'idle'}
            onChange={event => setCopy(event.target.value)}
          />
          <Button
            onClick={() => void save()}
            disabled={!copy?.trim() || status === 'saving'}
          >
            {status === 'saving' ? 'Saving…' : 'Save private draft'}
          </Button>
        </>
      )}
      {status === 'error' ? (
        <p role='alert'>
          Save could not be confirmed. Retry this same caption to check the
          saved version.
        </p>
      ) : null}
    </section>
  );
}
