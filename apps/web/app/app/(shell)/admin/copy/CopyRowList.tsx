'use client';

import { useState } from 'react';
import type { CopyRow } from '@/lib/copy-jam/inventory';
import { COPY_VERDICTS, type CopyVerdict } from '@/lib/copy-jam/verdicts';

interface Shown {
  readonly verdict: CopyVerdict;
  readonly note: string;
}

interface Props {
  readonly rows: readonly CopyRow[];
  readonly verdicts: Readonly<Record<string, Shown>>;
}

const VERDICT_CLASS: Record<CopyVerdict, string> = {
  sucks: 'text-primary-token',
  meh: 'text-secondary-token',
  great: 'text-primary-token',
};

export function CopyRowList({ rows, verdicts }: Props) {
  const [local, setLocal] = useState<Record<string, Shown>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function rate(copyId: string, verdict: CopyVerdict) {
    const note = (notes[copyId] ?? '').trim();
    setPending(copyId);
    setErrors(e => ({ ...e, [copyId]: '' }));
    try {
      const res = await fetch('/api/admin/copy-jam/verdict', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ copyId, verdict, ...(note ? { note } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setLocal(l => ({ ...l, [copyId]: { verdict, note } }));
      setNotes(n => ({ ...n, [copyId]: '' }));
    } catch {
      setErrors(e => ({ ...e, [copyId]: 'Not saved. Tap again.' }));
    } finally {
      setPending(null);
    }
  }

  if (rows.length === 0) {
    return <p className='text-sm text-secondary-token'>No lines match.</p>;
  }

  return (
    <ul className='flex flex-col' data-testid='admin-copy-rows'>
      {rows.map(row => {
        const shown = local[row.id] ?? verdicts[row.id];
        return (
          <li
            key={row.id}
            className='grid gap-3 border-t border-subtle py-4 md:grid-cols-[7rem_1fr_auto] md:items-start'
          >
            <span className='font-mono text-2xl text-primary-token'>
              {row.id}
            </span>
            <div className='min-w-0'>
              <p className='text-base text-primary-token'>{row.text}</p>
              <p className='mt-1 text-xs text-tertiary-token'>
                {row.route} · {row.role} · {row.section}
              </p>
              {shown ? (
                <p className={`mt-1 text-sm ${VERDICT_CLASS[shown.verdict]}`}>
                  {shown.verdict}
                  {shown.note ? ` · ${shown.note}` : ''}
                </p>
              ) : null}
              {errors[row.id] ? (
                <p role='alert' className='mt-1 text-sm text-secondary-token'>
                  {errors[row.id]}
                </p>
              ) : null}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <input
                aria-label={`Note for ${row.id}`}
                placeholder='Note'
                value={notes[row.id] ?? ''}
                onChange={e =>
                  setNotes(n => ({ ...n, [row.id]: e.target.value }))
                }
                className='h-9 w-40 rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token'
              />
              {COPY_VERDICTS.map(v => (
                <button
                  key={v}
                  type='button'
                  disabled={pending === row.id}
                  aria-pressed={shown?.verdict === v}
                  onClick={() => rate(row.id, v)}
                  className={`h-9 rounded-md border px-3 text-sm ${
                    shown?.verdict === v
                      ? 'border-default bg-surface-2 text-primary-token'
                      : 'border-subtle bg-surface-0 text-secondary-token'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
