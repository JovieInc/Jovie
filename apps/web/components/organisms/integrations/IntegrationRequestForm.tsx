'use client';

import { Button, Input, Textarea } from '@jovie/ui';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';

export function IntegrationRequestForm() {
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [signIn, setSignIn] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setSignIn(false);
    setMessage('Saving your request…');
    try {
      const response = await fetch('/api/integrations/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.get('provider'),
          capability: 'custom_workflow',
          useCase: form.get('useCase'),
        }),
      });
      if (response.status === 401) {
        setSignIn(true);
        setMessage('Sign in to save your request. Your text is still here.');
      } else if (!response.ok) {
        setMessage('Could not save your request. Please try again.');
      } else {
        setMessage(
          'Request saved. An integration draft has been created for review.'
        );
      }
    } catch {
      setMessage(
        'Connection interrupted. Your text is still here; please retry.'
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className='mt-16 max-w-xl space-y-4'>
      <h2 className='text-xl font-medium text-primary-token'>
        Missing An Integration?
      </h2>
      <p className='text-sm text-secondary-token'>
        Tell us which tool you need and what you want to do with it.
      </p>
      <label
        htmlFor={`${formId}-provider`}
        className='block space-y-2 text-sm text-secondary-token'
      >
        <span>Tool Or Service</span>
        <Input
          id={`${formId}-provider`}
          name='provider'
          required
          minLength={2}
          maxLength={80}
          autoComplete='off'
        />
      </label>
      <label
        htmlFor={`${formId}-use-case`}
        className='block space-y-2 text-sm text-secondary-token'
      >
        <span>What Would You Like To Do?</span>
        <Textarea
          id={`${formId}-use-case`}
          name='useCase'
          required
          minLength={10}
          maxLength={1000}
        />
      </label>
      <Button type='submit' disabled={pending}>
        {pending ? 'Saving…' : 'Request Integration'}
      </Button>
      <div className='min-h-16 text-sm text-secondary-token' role='status'>
        {message}
        {signIn && (
          <Link
            href={APP_ROUTES.SIGNIN}
            target='_blank'
            rel='noopener noreferrer'
            className='ml-2 text-accent'
          >
            Sign In In A New Tab
          </Link>
        )}
      </div>
    </form>
  );
}
