'use client';

import { Button, Input, NativeSelect, Textarea } from '@jovie/ui';
import { useState } from 'react';
import type {
  ReportCategory,
  ReportTargetType,
} from '@/lib/validation/schemas/report';

const TARGET_TYPE_OPTIONS = (
  [
    ['profile', 'Profile'],
    ['smart_link', 'Smart Link'],
    ['wrapped_link', 'Wrapped Link'],
    ['page', 'Other Jovie Page'],
  ] as const
).map(([value, label]) => ({ value: value as ReportTargetType, label }));

const CATEGORY_OPTIONS = (
  [
    ['phishing', 'Phishing Or Scam'],
    ['impersonation', 'Impersonation'],
    ['abuse', 'Abuse Or Harassment'],
    ['security', 'Security Issue'],
    ['other', 'Other'],
  ] as const
).map(([value, label]) => ({ value: value as ReportCategory, label }));

const GENERIC_ERROR = 'Unable to submit report right now.';

function Field({
  children,
  htmlFor,
  label,
}: Readonly<{
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}>) {
  return (
    <div className='space-y-1.5'>
      <label
        htmlFor={htmlFor}
        className='text-xs font-medium text-secondary-token'
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export interface ReportFormProps {
  readonly initialTargetType?: string;
  readonly initialTarget?: string;
}

export function ReportForm({
  initialTargetType,
  initialTarget,
}: ReportFormProps) {
  const defaultType = TARGET_TYPE_OPTIONS.some(
    ({ value }) => value === initialTargetType
  )
    ? initialTargetType
    : 'page';

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: form.get('targetType'),
          target: form.get('target'),
          category: form.get('category'),
          details: form.get('details') || undefined,
          reporterEmail: form.get('email') || undefined,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? GENERIC_ERROR);
        return;
      }

      // Generic confirmation only — no queue position or internal state.
      setSubmitted(true);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className='text-sm text-secondary-token' role='status'>
        Thanks — we received your report and will review it.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <Field htmlFor='report-target-type' label='What Are You Reporting?'>
        <NativeSelect
          id='report-target-type'
          name='targetType'
          options={TARGET_TYPE_OPTIONS}
          defaultValue={defaultType}
        />
      </Field>

      <Field htmlFor='report-target' label='Profile Handle, Link, Or Page URL'>
        <Input
          id='report-target'
          name='target'
          defaultValue={initialTarget}
          placeholder='E.g. @handle or https://jov.ie/…'
          required
          maxLength={500}
        />
      </Field>

      <Field htmlFor='report-category' label='Category'>
        <NativeSelect
          id='report-category'
          name='category'
          options={CATEGORY_OPTIONS}
          defaultValue='phishing'
        />
      </Field>

      <Field htmlFor='report-details' label='Details (Optional)'>
        <Textarea
          id='report-details'
          name='details'
          placeholder='Anything that helps us investigate.'
          maxLength={2000}
          rows={4}
        />
      </Field>

      <Field htmlFor='report-email' label='Your Email (Optional)'>
        <Input
          id='report-email'
          name='email'
          type='email'
          placeholder='Only if you want a follow-up'
          maxLength={320}
        />
      </Field>

      {error ? (
        <p className='text-xs text-destructive' role='alert'>
          {error}
        </p>
      ) : null}

      <Button type='submit' disabled={submitting} className='w-full'>
        {submitting ? 'Submitting…' : 'Submit report'}
      </Button>
    </form>
  );
}
