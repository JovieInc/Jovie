'use client';

import { Button } from '@jovie/ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import type {
  ReferenceAction,
  ReferenceCard,
  ReferenceCommand,
  ReferenceView,
} from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import { referenceKeyAction } from './keyboard';

const ENDPOINT = '/api/admin/reference-review';
const EMPTY = {
  boards: {},
  undoReferenceId: null,
  revision: 0,
  batchNumber: 0,
  batchSize: 0,
  items: [],
  top: [],
  ratedCount: 0,
  remaining: 0,
  heldCount: 0,
  canUndo: false,
  clusters: {},
} satisfies ReferenceView;

function ReferenceImage({ item }: { readonly item: ReferenceCard }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p role='status'>Preview unavailable. Open the source to inspect it.</p>
  ) : (
    <ImageWithFallback
      src={item.previewUrl}
      alt={item.title}
      width={item.width}
      height={item.height}
      referrerPolicy='no-referrer'
      className='h-full w-full object-contain'
      unoptimized
      onLoadError={() => setFailed(true)}
    />
  );
}

export function ReferenceReview({
  contextId = 'creative',
  branchId = 'main',
}: {
  readonly contextId?: string;
  readonly branchId?: string;
}) {
  const [view, setView] = useState<ReferenceView>(EMPTY);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clusterName, setClusterName] = useState('');
  const root = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const retryCommand = useRef<ReferenceCommand | null>(null);
  const active = view.items.find(item => item.id === selected) ?? view.items[0];
  const accept = useCallback((data: ReferenceView) => {
    setView(data);
    setSelected(previous =>
      data.items.some(item => item.id === previous)
        ? previous
        : (data.items[0]?.id ?? null)
    );
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        const response = await fetch(
          `${ENDPOINT}?${new URLSearchParams({ contextId, branchId })}`,
          { cache: 'no-store', signal }
        );
        if (!response.ok) throw new Error('References could not load. Retry.');
        accept((await response.json()) as ReferenceView);
        setLoaded(true);
        retryCommand.current = null;
      } catch (e) {
        if (!signal?.aborted)
          setError(
            e instanceof Error ? e.message : 'References could not load. Retry.'
          );
      }
    },
    [contextId, branchId, accept]
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const send = useCallback(
    async (action?: ReferenceAction) => {
      if (busy.current) return;
      if (!action && !retryCommand.current) return;
      // An uncertain response must be reconciled/retried before another action.
      if (action && retryCommand.current) return;
      busy.current = true;
      setPending(true);
      setError(null);
      const command = retryCommand.current ?? {
        commandId: crypto.randomUUID(),
        revision: view.revision,
        action: action as ReferenceAction,
      };
      retryCommand.current = command;
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextId, branchId, command }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          if (response.status === 409) {
            retryCommand.current = null;
            await load();
            throw new Error(
              'References changed in another tab. Review the refreshed batch.'
            );
          }
          throw new Error('Your action could not be saved. Retry or reload.');
        }
        accept((await response.json()) as ReferenceView);
        if (command.action.type === 'undo') setSelected(view.undoReferenceId);
        retryCommand.current = null;
        root.current?.focus({ preventScroll: true });
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Your action could not be saved. Retry or reload.'
        );
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [contextId, branchId, view.revision, view.undoReferenceId, load, accept]
  );
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const handle = (event: KeyboardEvent) => {
      const action = referenceKeyAction(event, active?.id ?? null);
      if (
        !action ||
        (action.type === 'undo' && !view.canUndo) ||
        pending ||
        !loaded ||
        error
      )
        return;
      event.preventDefault();
      void send(action);
    };
    element.addEventListener('keydown', handle);
    return () => element.removeEventListener('keydown', handle);
  }, [active?.id, view.canUndo, pending, loaded, error, send]);
  const disabled = pending || !loaded || Boolean(error);
  return (
    <section
      ref={root}
      tabIndex={-1}
      aria-label='Reference Review'
      className='focus-ring-themed flex h-full min-h-0 flex-col gap-4 overflow-auto p-4'
    >
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-balance text-xl font-semibold'>References</h1>
          <p className='text-sm text-secondary-token'>
            Rate 1–5 · S to skip · Z to undo.
          </p>
        </div>
        <p role='status' className='text-sm tabular-nums'>
          {error
            ? 'References unavailable'
            : loaded
              ? `${view.ratedCount} rated · ${view.remaining} remaining`
              : 'Loading references…'}
        </p>
        <Button
          variant='ghost'
          disabled={!loaded || pending || Boolean(error)}
          onClick={() => root.current?.focus()}
        >
          Start Keyboard Review
        </Button>
        <Button
          variant='ghost'
          disabled={pending || !view.canUndo || Boolean(error)}
          onClick={() => void send({ type: 'undo' })}
        >
          Undo
        </Button>
      </header>
      {error && (
        <div role='alert'>
          <p>{error}</p>
          <Button
            disabled={pending}
            onClick={() => (retryCommand.current ? void send() : void load())}
          >
            Retry
          </Button>
          <Button
            disabled={pending}
            variant='ghost'
            onClick={() => void load()}
          >
            Reload
          </Button>
        </div>
      )}
      {loaded && view.items.length === 0 && (
        <p role='status'>
          {view.ratedCount
            ? 'You’ve reviewed every available reference.'
            : 'No references ready to review.'}
          {view.heldCount > 0
            ? ` ${view.heldCount} awaiting source or preview verification.`
            : ''}
        </p>
      )}
      {active && (
        <>
          <div className='flex flex-none flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row'>
            <div
              className='flex h-72 min-h-64 flex-none items-center justify-center overflow-hidden bg-surface-1 lg:h-auto lg:min-h-0 lg:flex-1'
              aria-busy={pending}
            >
              <ReferenceImage key={active.id} item={active} />
            </div>
            <fieldset
              className='flex flex-none gap-2 overflow-x-auto lg:w-64 lg:flex-wrap lg:content-start lg:overflow-y-auto lg:overflow-x-hidden'
              aria-label={`Batch ${view.batchNumber}`}
            >
              {view.items.map(item => (
                <button
                  key={item.id}
                  type='button'
                  aria-label={`Select ${item.title}`}
                  aria-pressed={item.id === active.id}
                  className='focus-ring-themed h-20 w-20 shrink-0 border border-subtle p-1'
                  disabled={pending}
                  draggable={!disabled}
                  onDragStart={event =>
                    event.dataTransfer.setData(
                      'application/x-jovie-reference',
                      item.id
                    )
                  }
                  onClick={() => {
                    setSelected(item.id);
                    root.current?.focus({ preventScroll: true });
                  }}
                >
                  <ImageWithFallback
                    src={item.previewUrl}
                    alt=''
                    width={item.width}
                    height={item.height}
                    referrerPolicy='no-referrer'
                    unoptimized
                    className='h-full w-full object-contain'
                  />
                </button>
              ))}
            </fieldset>
          </div>
          <fieldset
            className='flex flex-wrap items-center gap-2'
            aria-label='Rate Selected Reference'
          >
            {[1, 2, 3, 4, 5].map(rating => (
              <Button
                key={rating}
                disabled={disabled}
                aria-label={`Rate ${rating} of 5`}
                onClick={() =>
                  void send({ type: 'rate', referenceId: active.id, rating })
                }
              >
                {rating}
              </Button>
            ))}
            <Button
              variant='ghost'
              disabled={disabled}
              onClick={() =>
                void send({ type: 'skip', referenceId: active.id })
              }
            >
              Skip
            </Button>
            <label className='text-sm'>
              Cluster{' '}
              <select
                className='focus-ring-themed min-h-11 bg-surface-1'
                value={active.clusterId ?? ''}
                disabled={disabled}
                onChange={event =>
                  void send({
                    type: 'cluster',
                    referenceId: active.id,
                    clusterId: event.target.value || null,
                  })
                }
              >
                <option value=''>Unassigned</option>
                {Object.entries(view.clusters).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <details>
            <summary className='focus-ring-themed cursor-pointer'>
              Source and details
            </summary>
            <p>
              {active.title} · {active.category ?? 'Unclassified'}
            </p>
            <p>{active.credit}</p>
            <a
              className='focus-ring-themed underline'
              href={active.sourceUrl}
              rel='noreferrer'
              target='_blank'
            >
              Open source
            </a>
            <p>Private reference only. Rating does not grant reuse rights.</p>
          </details>
        </>
      )}
      <form
        className='flex flex-wrap items-center gap-2'
        onSubmit={event => {
          event.preventDefault();
          if (clusterName.trim())
            void send({
              type: 'create-cluster',
              clusterId: crypto.randomUUID(),
              label: clusterName.trim(),
            });
        }}
      >
        <label>
          New cluster{' '}
          <input
            className='focus-ring-themed min-h-11 bg-surface-1'
            value={clusterName}
            maxLength={80}
            onChange={event => setClusterName(event.target.value)}
          />
        </label>
        <Button type='submit' disabled={disabled || !clusterName.trim()}>
          Create Cluster
        </Button>
      </form>
      {Object.entries(view.clusters).length > 0 && (
        <section aria-label='Cluster Boards' className='flex flex-wrap gap-4'>
          {Object.entries(view.clusters).map(([id, label]) => (
            <div key={id} className='min-w-0 flex-1'>
              <Button
                variant='ghost'
                disabled={disabled || !active}
                aria-label={`Move selected reference to ${label}`}
                onClick={() =>
                  active &&
                  void send({
                    type: 'cluster',
                    referenceId: active.id,
                    clusterId: id,
                  })
                }
                onDragOver={event => {
                  if (!disabled) event.preventDefault();
                }}
                onDrop={event => {
                  event.preventDefault();
                  const referenceId = event.dataTransfer.getData(
                    'application/x-jovie-reference'
                  );
                  if (
                    !disabled &&
                    view.items.some(item => item.id === referenceId)
                  )
                    void send({ type: 'cluster', referenceId, clusterId: id });
                }}
              >
                {label}
              </Button>
              <div className='flex flex-wrap gap-2'>
                {(view.boards[id] ?? []).map(item => (
                  <a
                    key={item.id}
                    href={item.sourceUrl}
                    rel='noreferrer'
                    target='_blank'
                    className='focus-ring-themed h-20 w-20'
                  >
                    <ImageWithFallback
                      src={item.previewUrl}
                      alt={item.title}
                      width={item.width}
                      height={item.height}
                      unoptimized
                      referrerPolicy='no-referrer'
                      className='h-full w-full object-contain'
                    />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      {view.top.length > 0 && (
        <details>
          <summary className='focus-ring-themed cursor-pointer'>
            Top references ({view.top.length})
          </summary>
          <ul>
            {view.top.map(item => (
              <li key={item.id}>
                <a
                  href={item.sourceUrl}
                  rel='noreferrer'
                  target='_blank'
                  className='focus-ring-themed underline'
                >
                  {item.title} · {item.rating}/5
                  {item.clusterId ? ` · ${view.clusters[item.clusterId]}` : ''}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
