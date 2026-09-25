'use client';

import { Lock } from 'lucide-react';
import { useState } from 'react';

interface LibrarySharePassphraseGateProps {
  readonly title: string;
  readonly artistName: string;
  readonly onUnlock: (passphrase: string) => Promise<boolean>;
}

export function LibrarySharePassphraseGate({
  title,
  artistName,
  onUnlock,
}: LibrarySharePassphraseGateProps) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const ok = await onUnlock(passphrase);
    if (!ok) {
      setError('Incorrect passphrase. Try again.');
      setLoading(false);
      return;
    }
  }

  return (
    <div
      className='mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 text-center'
      data-testid='library-share-passphrase-gate'
    >
      <span className='mb-4 grid h-12 w-12 place-items-center rounded-full border border-subtle bg-surface-1'>
        <Lock className='h-5 w-5 text-secondary-token' strokeWidth={2.25} />
      </span>
      <h1 className='text-xl font-semibold tracking-tight text-primary-token'>
        {title}
      </h1>
      <p className='mt-2 text-sm text-secondary-token'>
        Shared by {artistName}. Enter the passphrase to view this drop.
      </p>
      <form className='mt-8 w-full space-y-3' onSubmit={handleSubmit}>
        <label className='sr-only' htmlFor='library-share-passphrase'>
          Passphrase
        </label>
        <input
          id='library-share-passphrase'
          type='password'
          autoComplete='current-password'
          value={passphrase}
          onChange={event => setPassphrase(event.target.value)}
          placeholder='Passphrase'
          className='w-full rounded-xl border border-subtle bg-surface-0 px-4 py-3 text-sm text-primary-token outline-none transition-colors focus-visible:border-(--linear-border-focus)'
          disabled={loading}
        />
        {error ? (
          <p className='text-left text-sm text-error' role='alert'>
            {error}
          </p>
        ) : null}
        <button
          type='submit'
          disabled={loading || passphrase.length === 0}
          className='w-full rounded-xl border border-(--linear-btn-primary-border) bg-btn-primary px-4 py-3 text-sm font-medium text-btn-primary-foreground shadow-button-inset transition-colors hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover disabled:opacity-50'
        >
          {loading ? 'Unlocking…' : 'Unlock drop'}
        </button>
      </form>
    </div>
  );
}
