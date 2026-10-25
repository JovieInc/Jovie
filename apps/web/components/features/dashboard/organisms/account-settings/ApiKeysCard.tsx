'use client';

import { Button, ConfirmDialog, Input } from '@jovie/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { REALTIME_CACHE } from '@/lib/queries/cache-strategies';

export function ApiKeysCard({ userId }: { readonly userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className='cursor-pointer px-4 py-3 text-app font-medium text-primary-token sm:px-5'>
        API Keys
      </summary>
      {open ? <ApiKeysManager key={userId} userId={userId} /> : null}
    </details>
  );
}

function ApiKeysManager({ userId }: { readonly userId: string }) {
  const nameId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const revokeButton = useRef<HTMLButtonElement | null>(null);
  const client = useQueryClient();
  const queryKey = ['account-api-keys', userId];
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<{ id: string; key: string } | null>(
    null
  );
  const [revoking, setRevoking] = useState<{
    id: string;
    name: string | null;
  } | null>(null);
  const keys = useQuery({
    ...REALTIME_CACHE,
    queryKey,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await authClient.apiKey.list({ fetchOptions: { signal } });
      if (result.error) throw new Error('Could not load API keys.');
      return result.data.apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        start: key.start,
      }));
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: { id: string } | { name: string }) => {
      if ('id' in input) {
        const result = await authClient.apiKey.delete({ keyId: input.id });
        if (result.error)
          throw new Error('Could not revoke this key. Try again.');
        if (secret?.id === input.id) setSecret(null);
      } else {
        const result = await authClient.apiKey.create({ name: input.name });
        if (result.error) throw new Error('Could not create a key. Try again.');
        // The raw key stays in local state, never query/mutation cache or storage.
        setSecret({ id: result.data.id, key: result.data.key });
        setName('');
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  return (
    <div className='space-y-3 px-4 pb-4 sm:px-5'>
      <p className='text-app text-secondary-token'>
        Connect the Jovie CLI or an agent. Profile creations are attributed to
        your account; claiming an artist still requires verification.
      </p>
      <form
        className='flex flex-wrap items-end gap-2'
        onSubmit={event => {
          event.preventDefault();
          if (name.trim() && !mutation.isPending)
            mutation.mutate({ name: name.trim() });
        }}
      >
        <label
          htmlFor={nameId}
          className='min-w-0 flex-1 text-app text-secondary-token'
        >
          Key name
          <Input
            id={nameId}
            ref={nameInput}
            value={name}
            maxLength={80}
            required
            autoComplete='off'
            onChange={event => setName(event.target.value)}
          />
        </label>
        <Button
          type='submit'
          size='sm'
          disabled={!name.trim() || mutation.isPending}
        >
          {mutation.isPending &&
          mutation.variables &&
          'name' in mutation.variables
            ? 'Creating…'
            : 'Create Key'}
        </Button>
      </form>
      <div className='min-h-24' aria-live='polite'>
        {secret ? (
          <div className='space-y-1'>
            <p className='text-app text-secondary-token'>
              Copy this key now. It is shown only once. Set it as JOVIE_API_KEY
              in your CLI or MCP environment.
            </p>
            <code className='block break-all select-all text-app text-primary-token'>
              {secret.key}
            </code>
            <Button size='sm' variant='ghost' onClick={() => setSecret(null)}>
              Hide Key
            </Button>
          </div>
        ) : (
          <p className='text-app text-secondary-token'>
            New keys expire after 90 days. Revoking a key stops its access
            immediately.
          </p>
        )}
      </div>
      <div className='min-h-8 text-app' role='status'>
        {mutation.error ? (
          <p className='text-error'>{mutation.error.message}</p>
        ) : null}
      </div>
      <div className='h-48 overflow-y-auto' aria-busy={keys.isPending}>
        {keys.isPending ? (
          <p className='text-app text-secondary-token'>Loading keys…</p>
        ) : null}
        {keys.isError ? (
          <div>
            <p className='text-app text-secondary-token'>
              Could not load API keys.
            </p>
            <Button size='sm' variant='ghost' onClick={() => keys.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {keys.isSuccess && keys.data.length === 0 ? (
          <p className='text-app text-secondary-token'>No API keys yet.</p>
        ) : null}
        <ul className='divide-y divide-subtle'>
          {keys.data?.map(key => (
            <li
              key={key.id}
              className='flex min-h-16 items-center justify-between gap-2'
            >
              <div className='min-w-0'>
                <p className='truncate text-app text-primary-token'>
                  {key.name}
                </p>
                <p className='text-app text-secondary-token'>{key.start}…</p>
              </div>
              <Button
                size='sm'
                variant='ghost'
                disabled={mutation.isPending}
                aria-label={`Revoke ${key.name}`}
                onClick={event => {
                  revokeButton.current = event.currentTarget;
                  setRevoking(key);
                }}
              >
                {mutation.isPending &&
                mutation.variables &&
                'id' in mutation.variables &&
                mutation.variables.id === key.id
                  ? 'Revoking…'
                  : 'Revoke'}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={value => {
          if (!value) {
            setRevoking(null);
            requestAnimationFrame(() => {
              (revokeButton.current?.isConnected
                ? revokeButton.current
                : nameInput.current
              )?.focus();
            });
          }
        }}
        title='Revoke API key?'
        description={`Agents using ${revoking?.name ?? 'this key'} will lose access. You can create a new key.`}
        confirmLabel='Revoke Key'
        variant='destructive'
        isLoading={mutation.isPending}
        onConfirm={() => {
          if (revoking && !mutation.isPending)
            return mutation.mutateAsync({ id: revoking.id });
        }}
      />
    </div>
  );
}
