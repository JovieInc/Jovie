'use client';

import { Button } from '@jovie/ui';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Label } from '@/components/atoms/Label';
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
  readonly onClose: () => void;
  /** Profile URL the UTM params are appended to. */
  readonly baseUrl: string;
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

/**
 * Builds a profile URL with UTM tracking params.
 *
 * ponytail: plain controlled inputs + URLSearchParams — no form library for 5
 * optional fields.
 */
export function UtmBuilderDialog({
  open,
  onClose,
  baseUrl,
}: UtmBuilderDialogProps) {
  const [values, setValues] = useState<Record<UtmField, string>>({
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_term: '',
    utm_content: '',
  });
  const [copied, setCopied] = useState(false);

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
    const ok = await copyToClipboard(resultUrl);
    if (ok) {
      setCopied(true);
      toast.success('Tracking link copied');
      setTimeout(() => setCopied(false), 1600);
      return;
    }
    toast.error('Failed to copy');
  };

  return (
    <Dialog open={open} onClose={onClose} size='md'>
      <DialogTitle>UTM Builder</DialogTitle>
      <DialogBody className='space-y-3'>
        {UTM_FIELDS.map(({ key, label, required, placeholder }) => (
          <div key={key}>
            <Label htmlFor={`utm-${key}`} required={required}>
              {label}
            </Label>
            <input
              id={`utm-${key}`}
              type='text'
              value={values[key]}
              placeholder={placeholder}
              onChange={event =>
                setValues(prev => ({ ...prev, [key]: event.target.value }))
              }
              className='h-9 w-full rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-app text-primary-token outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            />
          </div>
        ))}

        <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-2'>
          <p className='break-all font-mono text-2xs leading-5 text-secondary-token'>
            {resultUrl}
          </p>
        </div>
      </DialogBody>

      <DialogActions>
        <Button
          type='button'
          variant='secondary'
          onClick={() =>
            globalThis.open(resultUrl, '_blank', 'noopener,noreferrer')
          }
        >
          <ExternalLink className='mr-2 h-4 w-4' aria-hidden='true' />
          Open
        </Button>
        <Button type='button' variant='primary' onClick={handleCopy}>
          {copied ? (
            <Check className='mr-2 h-4 w-4' aria-hidden='true' />
          ) : (
            <Copy className='mr-2 h-4 w-4' aria-hidden='true' />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
