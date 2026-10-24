'use client';

// @coverage-via apps/web/components/shell/RuntimeUpdateProvider.test.tsx

import { Button } from '@jovie/ui';
import { useEffect, useId } from 'react';
import { TOAST_DURATIONS, toast } from '@/components/feedback';

const UPDATE_TOAST_ID = 'runtime-update';

/** A single route-independent update action, outside the Inbox work list. */
export function RuntimeUpdateToast({
  available,
  title,
  description,
  busy,
  apply,
}: {
  readonly available: boolean;
  readonly title: string;
  readonly description: string;
  readonly busy: boolean;
  readonly apply: () => void;
}) {
  const descriptionId = useId();

  useEffect(() => {
    if (!available) return;
    toast.message(title, {
      id: UPDATE_TOAST_ID,
      description: <span id={descriptionId}>{description}</span>,
      duration: TOAST_DURATIONS.PERSISTENT,
      dismissible: false,
      closeButton: false,
      action: (
        <Button
          size='sm'
          variant='secondary'
          disabled={busy}
          onClick={apply}
          aria-describedby={descriptionId}
        >
          {title}
        </Button>
      ),
    });
  }, [available, title, description, busy, apply, descriptionId]);

  useEffect(() => {
    if (!available) toast.dismiss(UPDATE_TOAST_ID);
    return () => {
      toast.dismiss(UPDATE_TOAST_ID);
    };
  }, [available]);
  return null;
}
