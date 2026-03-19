'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Input } from '@jovie/ui/atoms/input';
import { Mail } from 'lucide-react';
import { type FormEvent, useState } from 'react';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function ChangelogEmailSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/changelog/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          turnstileToken: '',
          source: 'changelog_page',
        }),
      });

      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong'
      );
    }
  }

  return (
    <div
      id='changelog-subscribe'
      className='rounded-2xl p-8 md:p-10'
      style={{
        backgroundColor:
          'color-mix(in srgb, var(--linear-text-primary) 3%, transparent)',
        border:
          '1px solid color-mix(in srgb, var(--linear-text-primary) 8%, transparent)',
      }}
    >
      <div className='flex items-center gap-3 mb-3'>
        <Mail className='h-5 w-5 opacity-50' />
        <h3 className='text-lg font-semibold tracking-tight'>
          Stay in the loop
        </h3>
      </div>
      <p className='text-sm opacity-60 mb-6'>
        Get notified when we ship something new. No spam, just product updates.
      </p>

      {status === 'success' ? (
        <div
          className='rounded-xl p-4 text-sm text-center font-medium'
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--linear-text-primary) 5%, transparent)',
          }}
        >
          Check your email to confirm your subscription!
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className='flex flex-col sm:flex-row gap-3'
        >
          <Input
            type='email'
            placeholder='you@example.com'
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className='flex-1'
            disabled={status === 'submitting'}
          />
          <Button
            type='submit'
            size='lg'
            disabled={status === 'submitting'}
            className='rounded-full'
          >
            {status === 'submitting' ? 'Subscribing...' : 'Subscribe'}
          </Button>
        </form>
      )}

      {status === 'error' && errorMessage && (
        <p className='mt-3 text-sm text-red-500'>{errorMessage}</p>
      )}
    </div>
  );
}
