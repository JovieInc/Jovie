'use client';

import { Button, Input, NativeSelect, Textarea } from '@jovie/ui';
import { useState } from 'react';
import type {
  ReportCategory,
  ReportTargetType,
} from '@/lib/validation/schemas/report';

const TARGET_TYPE_OPTIONS = [
  { value: 'profile', label: 'Profile' },
  { value: 'smart_link', label: 'Smart Link' },
  { value: 'wrapped_link', label: 'Wrapped Link' },
  { value: 'page', label: 'Other Jovie Page' },
] as const satisfies ReadonlyArray<{
  value: ReportTargetType;
  label: string;
}>;

const CATEGORY_OPTIONS = [
  { value: 'phishing', label: 'Phishing Or Scam' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'abuse', label: 'Abuse Or Harassment' },
  { value: 'security', label: 'Security Issue' },
  { value: 'other', label: 'Other' },
] as const satisfies ReadonlyArray<{
  value: ReportCategory;
  label: string;
}>;

const SUCCESS_MESSAGE = 'Thanks — we received your report and will review it.';

export interface ReportFormProps {
  readonly initialTargetType?: string;
  readonly initialTarget?: string;
}

export function ReportForm({
  initialTargetType,
  initialTarget,
}: ReportFormProps) {
  const validTargetType = TARGET_TYPE_OPTIONS.some(
    option => option.value === initialTargetType
  )
    ? (initialTargetType as ReportTargetType)
    : 'page';

  const [targetType, setTargetType] =
    useState<ReportTargetType>(validTargetType);
  const [target, setTarget] = useState(initialTarget ?? '');
  const [category, setCategory] = useState<ReportCategory>('phishing');
  const [details, setDetails] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          target,
          category,
          details: details || undefined,
          reporterEmail: reporterEmail || undefined,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? 'Unable to submit report right now.');
        return;
      }

      // Deliberately show only a generic confirmation — no queue position,
      // moderation state, or internal identifiers are exposed to reporters.
      setSubmitted(true);
    } catch {
      setError('Unable to submit report right now.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className='text-sm text-secondary-token' role='status'>
        {SUCCESS_MESSAGE}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-1.5'>
        <label
          htmlFor='report-target-type'
          className='text-xs font-medium text-secondary-token'
        >
          What are you reporting?
        </label>
        <NativeSelect
          id='report-target-type'
          options={TARGET_TYPE_OPTIONS}
          value={targetType}
          onChange={event =>
            setTargetType(event.target.value as ReportTargetType)
          }
        />
      </div>

      <div className='space-y-1.5'>
        <label
          htmlFor='report-target'
          className='text-xs font-medium text-secondary-token'
        >
          Profile handle, link, or page URL
        </label>
        <Input
          id='report-target'
          value={target}
          onChange={event => setTarget(event.target.value)}
          placeholder='E.g. @handle or https://jov.ie/…'
          required
          maxLength={500}
        />
      </div>

      <div className='space-y-1.5'>
        <label
          htmlFor='report-category'
          className='text-xs font-medium text-secondary-token'
        >
          Category
        </label>
        <NativeSelect
          id='report-category'
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={event => setCategory(event.target.value as ReportCategory)}
        />
      </div>

      <div className='space-y-1.5'>
        <label
          htmlFor='report-details'
          className='text-xs font-medium text-secondary-token'
        >
          Details (optional)
        </label>
        <Textarea
          id='report-details'
          value={details}
          onChange={event => setDetails(event.target.value)}
          placeholder='Anything that helps us investigate.'
          maxLength={2000}
          rows={4}
        />
      </div>

      <div className='space-y-1.5'>
        <label
          htmlFor='report-email'
          className='text-xs font-medium text-secondary-token'
        >
          Your email (optional)
        </label>
        <Input
          id='report-email'
          type='email'
          value={reporterEmail}
          onChange={event => setReporterEmail(event.target.value)}
          placeholder='Only if you want a follow-up'
          maxLength={320}
        />
      </div>

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
