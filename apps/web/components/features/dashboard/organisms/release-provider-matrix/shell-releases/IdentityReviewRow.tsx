'use client';

import { Button } from '@jovie/ui/atoms/button';
import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ShellListRowFrame } from '@/components/organisms/table';
import { ArtworkThumb } from '@/components/shell/ArtworkThumb';
import { TypeBadge } from '@/components/shell/TypeBadge';
import type { ReleaseViewModel } from '@/lib/discography/types';

export type IdentityDecision = 'accepted' | 'rejected';

/** Seconds the artist can undo before the answer is written. */
export const IDENTITY_UNDO_WINDOW_MS = 6000;

type Phase =
  | { readonly kind: 'asking' }
  | { readonly kind: 'pending'; readonly decision: IdentityDecision }
  | { readonly kind: 'saving'; readonly decision: IdentityDecision }
  | { readonly kind: 'done'; readonly decision: IdentityDecision }
  | { readonly kind: 'error'; readonly decision: IdentityDecision };

async function defaultCommit(releaseId: string, decision: IdentityDecision) {
  const { commitReleaseIdentityDecision } = await import(
    '@/app/app/(shell)/dashboard/releases/actions'
  );
  return commitReleaseIdentityDecision({ releaseId, decision });
}

/**
 * Holds the answer for a few seconds so it can be undone, then writes it.
 * Nothing is persisted until the window closes; unmounting flushes a pending
 * answer so a quick navigation does not lose it.
 */
export function useIdentityDecision(
  releaseId: string,
  commit: (
    releaseId: string,
    decision: IdentityDecision
  ) => Promise<{ ok: boolean }> = defaultCommit,
  undoWindowMs: number = IDENTITY_UNDO_WINDOW_MS
) {
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDecision = useRef<IdentityDecision | null>(null);

  const write = useCallback(
    async (decision: IdentityDecision) => {
      pendingDecision.current = null;
      setPhase({ kind: 'saving', decision });
      try {
        const result = await commit(releaseId, decision);
        setPhase(
          result.ok ? { kind: 'done', decision } : { kind: 'error', decision }
        );
      } catch {
        setPhase({ kind: 'error', decision });
      }
    },
    [commit, releaseId]
  );

  const decide = useCallback(
    (decision: IdentityDecision) => {
      if (timer.current) clearTimeout(timer.current);
      pendingDecision.current = decision;
      setPhase({ kind: 'pending', decision });
      timer.current = setTimeout(() => {
        timer.current = null;
        void write(decision);
      }, undoWindowMs);
    },
    [undoWindowMs, write]
  );

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pendingDecision.current = null;
    setPhase({ kind: 'asking' });
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const pending = pendingDecision.current;
      if (pending) void commit(releaseId, pending);
    },
    [commit, releaseId]
  );

  return { phase, decide, undo, retry: decide };
}

/**
 * "Is this you?" row: an unsure provider match, shown in the release list
 * instead of going public. Mobile first: the two 44px buttons sit under the
 * provenance on narrow screens and move to the right edge from md up.
 */
export function IdentityReviewRow({
  release,
  typeLabel,
  commit,
  undoWindowMs,
  onDecided,
  ...hostProps
}: {
  readonly release: ReleaseViewModel;
  readonly typeLabel: string;
  readonly commit?: (
    releaseId: string,
    decision: IdentityDecision
  ) => Promise<{ ok: boolean }>;
  readonly undoWindowMs?: number;
  /** Called once the answer is written. */
  readonly onDecided?: (decision: IdentityDecision) => void;
} & Omit<
  ComponentPropsWithoutRef<'li'>,
  'children' | 'className' | 'aria-label' | 'role'
>) {
  const { phase, decide, undo, retry } = useIdentityDecision(
    release.id,
    commit,
    undoWindowMs
  );
  const review = release.identityReview;
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (phase.kind === 'done' && !notifiedRef.current) {
      notifiedRef.current = true;
      onDecided?.(phase.decision);
    }
  }, [phase, onDecided]);

  if (!review || phase.kind === 'done') return null;

  const artists = release.artistNames?.join(', ');

  return (
    <ShellListRowFrame
      as='li'
      {...hostProps}
      aria-label={`Is this you? ${release.title}`}
      data-shell-release-row
      data-identity-review={phase.kind}
      data-release-id={release.id}
      chrome='shell'
      density='dense'
      isSelected={false}
      className='flex h-auto flex-col gap-3 px-3 py-3 md:flex-row md:items-center'
    >
      <div className='flex min-w-0 flex-1 items-start gap-3'>
        <ArtworkThumb
          src={release.artworkUrl ?? ''}
          title={release.title}
          size={40}
        />
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <span className='truncate text-app font-caption text-primary-token'>
              {release.title}
            </span>
            <TypeBadge label={typeLabel} />
          </div>
          {artists ? (
            <p className='truncate text-2xs text-tertiary-token'>{artists}</p>
          ) : null}
          <p
            className='mt-1 text-2xs leading-[1.4] text-tertiary-token'
            data-testid='identity-review-provenance'
          >
            {review.provenance}
          </p>
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-2 md:justify-end'>
        {phase.kind === 'asking' || phase.kind === 'error' ? (
          <>
            <span className='mr-1 hidden text-xs font-caption text-secondary-token md:inline'>
              {phase.kind === 'error'
                ? "Couldn't save. Try again"
                : 'Is this you?'}
            </span>
            <p className='mr-auto text-xs font-caption text-secondary-token md:hidden'>
              {phase.kind === 'error'
                ? "Couldn't save. Try again"
                : 'Is this you?'}
            </p>
            <Button
              type='button'
              variant='primary'
              size='md'
              onClick={e => {
                e.stopPropagation();
                (phase.kind === 'error' ? retry : decide)('accepted');
              }}
            >
              Accept
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='md'
              onClick={e => {
                e.stopPropagation();
                (phase.kind === 'error' ? retry : decide)('rejected');
              }}
            >
              Reject
            </Button>
          </>
        ) : (
          <>
            <p
              className='mr-auto text-xs font-caption text-secondary-token md:mr-2'
              role='status'
            >
              {phase.decision === 'accepted'
                ? 'Accepted. Publishing…'
                : 'Rejected. Hiding…'}
            </p>
            <Button
              type='button'
              variant='tertiary'
              size='md'
              disabled={phase.kind === 'saving'}
              onClick={e => {
                e.stopPropagation();
                undo();
              }}
            >
              Undo
            </Button>
          </>
        )}
      </div>
    </ShellListRowFrame>
  );
}
