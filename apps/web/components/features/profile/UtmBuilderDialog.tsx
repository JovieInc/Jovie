'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Input } from '@jovie/ui/atoms/input';
import { Label } from '@jovie/ui/atoms/label';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { copyToClipboard } from '@/hooks/useClipboard';

interface UtmBuilderDialogProps {
  readonly open: boolean;
  /** Required for the modal. Omitted when `embedded` renders the fields inline. */
  readonly onClose?: () => void;
  /** Profile URL the UTM params are appended to. */
  readonly baseUrl: string;
  /** Inline fields for a page surface. Skips the dialog portal. */
  readonly embedded?: boolean;
  readonly initialValues?: Partial<Record<UtmField, string>>;
}

const UTM_FIELDS = [
  {
    key: 'utm_source',
    label: 'Source',
    required: true,
    placeholder: 'instagram',
  },
  {
    key: 'utm_medium',
    label: 'Medium',
    required: false,
    placeholder: 'social',
  },
  {
    key: 'utm_campaign',
    label: 'Campaign',
    required: false,
    placeholder: 'summer_tour',
  },
  { key: 'utm_term', label: 'Term', required: false, placeholder: 'optional' },
  {
    key: 'utm_content',
    label: 'Content',
    required: false,
    placeholder: 'optional',
  },
] as const;

type UtmField = (typeof UTM_FIELDS)[number]['key'];

function withInitialValues(
  initialValues: Partial<Record<UtmField, string>> | undefined
): Record<UtmField, string> {
  return {
    utm_source: initialValues?.utm_source ?? '',
    utm_medium: initialValues?.utm_medium ?? '',
    utm_campaign: initialValues?.utm_campaign ?? '',
    utm_term: initialValues?.utm_term ?? '',
    utm_content: initialValues?.utm_content ?? '',
  };
}

/**
 * Builds a profile URL with UTM tracking params.
 *
 * ponytail: controlled canonical Input atoms + URLSearchParams — no form
 * library for 5 fields. Source is required: Copy/Open stay disabled (with an
 * inline plain-language rule) until utm_source is non-empty.
 */
export function UtmBuilderDialog({
  open,
  onClose,
  baseUrl,
  embedded = false,
  initialValues,
}: UtmBuilderDialogProps) {
  const [values, setValues] = useState<Record<UtmField, string>>(() =>
    withInitialValues(initialValues)
  );
  const [copied, setCopied] = useState(false);

  const sourceMissing = values.utm_source.trim() === '';

  const resultUrl = useMemo(() => {
    const params = new URLSearchParams();
    for (const { key } of UTM_FIELDS) {
      const value = values[key].trim();
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `${baseUrl}?${query}` : baseUrl;
  }, [baseUrl, values]);

  const handleCopy = async () => {
    if (sourceMissing) return;
    const ok = await copyToClipboard(resultUrl);
    if (ok) {
      setCopied(true);
      toast.success('Tracking link copied');
      setTimeout(() => setCopied(false), 1600);
      return;
    }
    toast.error('Failed to copy');
  };

  const fields = (
    <>
      {UTM_FIELDS.map(({ key, label, required, placeholder }) => (
        <div key={key} className='grid gap-1.5'>
          <Label htmlFor={`utm-${key}`} required={required}>
            {label}
          </Label>
          <Input
            id={`utm-${key}`}
            type='text'
            value={values[key]}
            placeholder={placeholder}
            onChange={event =>
              setValues(prev => ({ ...prev, [key]: event.target.value }))
            }
          />
        </div>
      ))}

      <div className='rounded-lg border border-(--app-shell-frame-seam) bg-surface-0 px-2.5 py-2'>
        <p className='break-all font-mono text-2xs leading-5 text-secondary-token'>
          {resultUrl}
        </p>
      </div>

      {/* Fixed-height slot so the rule appearing/clearing never reflows the dialog. */}
      <p className='min-h-4 text-xs text-secondary-token' aria-live='polite'>
        {sourceMissing
          ? 'Add a source (like instagram) to create your tracking link.'
          : null}
      </p>
    </>
  );

  const actions = (
    <>
      <Button
        type='button'
        variant='secondary'
        disabled={sourceMissing}
        onClick={() =>
          globalThis.open(resultUrl, '_blank', 'noopener,noreferrer')
        }
      >
        <ExternalLink className='mr-2 h-4 w-4' aria-hidden='true' />
        Open
      </Button>
      <Button
        type='button'
        variant='primary'
        disabled={sourceMissing}
        onClick={handleCopy}
      >
        {copied ? (
          <Check className='mr-2 h-4 w-4' aria-hidden='true' />
        ) : (
          <Copy className='mr-2 h-4 w-4' aria-hidden='true' />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </>
  );

  if (embedded) {
    return (
      <div data-testid='utm-builder' className='space-y-3'>
        <p className='text-sm font-medium text-primary-token'>UTM Builder</p>
        {fields}
        <div className='flex flex-wrap justify-end gap-3'>{actions}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onClose={onClose ?? (() => undefined)} size='md'>
      <DialogTitle>UTM Builder</DialogTitle>
      <DialogBody className='space-y-3'>{fields}</DialogBody>
      <DialogActions>{actions}</DialogActions>
    </Dialog>
  );
}
