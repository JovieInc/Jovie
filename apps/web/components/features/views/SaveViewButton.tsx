'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { fetchWithTimeout } from '@/lib/queries/fetch';

interface SaveViewResponse {
  readonly url: string;
  readonly token: string;
  readonly created: boolean;
}

export function SaveViewButton({
  token,
  viewerOwnsView,
}: Readonly<{ token: string; viewerOwnsView: boolean }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (viewerOwnsView) {
    return (
      <Link
        href={APP_ROUTES.DASHBOARDS}
        className='text-xs text-secondary-token hover:text-primary-token'
      >
        In your dashboards
      </Link>
    );
  }

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await fetchWithTimeout<SaveViewResponse>(
        `/api/views/${encodeURIComponent(token)}/save`,
        { method: 'POST' }
      );
      track('shared_view_saved', { created: result.created });
      router.push(`/v/${result.token}`);
    } catch {
      setError('Could not save this view. Try again.');
      setPending(false);
    }
  };

  return (
    <div className='flex items-center gap-3'>
      {error ? (
        <p role='alert' className='text-xs text-secondary-token'>
          {error}
        </p>
      ) : null}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        disabled={pending}
        onClick={save}
      >
        {pending ? 'Saving…' : 'Save as dashboard'}
      </Button>
    </div>
  );
}
