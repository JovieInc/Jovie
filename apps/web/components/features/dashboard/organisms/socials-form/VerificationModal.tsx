'use client';

import { Button } from '@jovie/ui';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { useClipboard } from '@/hooks/useClipboard';
import type { VerificationError } from './types';

const DNS_PROVIDER_LINKS = [
  {
    name: 'Cloudflare',
    url: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
  },
  {
    name: 'GoDaddy',
    url: 'https://www.godaddy.com/help/add-a-txt-record-19232',
  },
  {
    name: 'Namecheap',
    url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/',
  },
  {
    name: 'Google Domains',
    url: 'https://support.google.com/domains/answer/3290350',
  },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  dns_not_found:
    "We couldn't find the TXT record yet. DNS changes can take up to 48 hours to propagate. Please try again later.",
  domain_already_claimed:
    'This domain has already been verified by another account. If you own this domain, please contact support.',
  invalid_url: 'The website URL is invalid. Please update it and try again.',
  rate_limited:
    'Too many verification attempts. Please wait a few minutes before trying again.',
  server_error: 'Something went wrong. Please try again.',
};

interface VerificationModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly hostname: string;
  readonly verificationToken: string;
  readonly onVerify: () => Promise<void>;
  readonly verifying: boolean;
  readonly verificationStatus: 'unverified' | 'pending' | 'verified';
  readonly verificationError: VerificationError | null;
}

export function VerificationModal({
  open,
  onClose,
  hostname,
  verificationToken,
  onVerify,
  verifying,
  verificationStatus,
  verificationError,
}: VerificationModalProps) {
  const { copy, isSuccess: isCopied } = useClipboard();
  const [showProviders, setShowProviders] = useState(false);

  const isVerified = verificationStatus === 'verified';
  const displayError = verificationError
    ? (ERROR_MESSAGES[verificationError.code] ?? verificationError.message)
    : null;

  return (
    <Dialog open={open} onClose={onClose} size='md'>
      <DialogTitle>Verify Your Website</DialogTitle>
      <DialogDescription>
        Prove you own <strong>{hostname}</strong> by adding a DNS TXT record.
      </DialogDescription>

      <DialogBody>
        {isVerified ? (
          <ContentSurfaceCard
            className='flex items-center gap-3 border-success/25 bg-success/5 p-4'
            data-testid='verification-success'
          >
            <CheckCircle2 className='h-5 w-5 text-success shrink-0' />
            <div>
              <p className='text-app font-[510] text-success'>
                Domain verified!
              </p>
              <p className='mt-0.5 text-xs text-secondary-token'>
                {hostname} has been successfully verified.
              </p>
            </div>
          </ContentSurfaceCard>
        ) : (
          <div className='space-y-5'>
            {/* Step-by-step instructions */}
            <ol className='list-inside list-decimal space-y-3 text-app text-secondary-token'>
              <li>
                Log in to your domain provider (DNS host) for{' '}
                <strong className='text-primary-token'>{hostname}</strong>
              </li>
              <li>Navigate to the DNS settings for your domain</li>
              <li>
                Add a new <strong className='text-primary-token'>TXT</strong>{' '}
                record with the value below
              </li>
              <li>Wait for DNS propagation (can take up to 48 hours)</li>
              <li>
                Click{' '}
                <strong className='text-primary-token'>
                  Check Verification
                </strong>{' '}
                below
              </li>
            </ol>

            {/* Token display with copy */}
            <div className='space-y-2'>
              <span className='text-app font-[510] text-secondary-token'>
                TXT Record Value
              </span>
              <div className='flex items-center gap-2'>
                <ContentSurfaceCard className='flex-1 bg-surface-0 px-3 py-2.5'>
                  <code
                    className='block break-all select-all text-xs font-mono text-primary-token'
                    data-testid='verification-token'
                  >
                    {verificationToken}
                  </code>
                </ContentSurfaceCard>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => copy(verificationToken)}
                  className='shrink-0 gap-1.5'
                  aria-label='Copy verification token'
                  data-testid='copy-token-button'
                >
                  {isCopied ? (
                    <>
                      <Check className='h-3.5 w-3.5' />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className='h-3.5 w-3.5' />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* DNS provider help */}
            <ContentSurfaceCard className='overflow-hidden bg-surface-0 p-0'>
              <button
                type='button'
                onClick={() => setShowProviders(prev => !prev)}
                className='flex w-full items-center justify-between px-3 py-2.5 text-app font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                aria-expanded={showProviders}
                data-testid='provider-tips-toggle'
              >
                <span>DNS Provider Guides</span>
                {showProviders ? (
                  <ChevronUp className='h-3.5 w-3.5' />
                ) : (
                  <ChevronDown className='h-3.5 w-3.5' />
                )}
              </button>
              {showProviders && (
                <div
                  className='space-y-1.5 border-t border-subtle px-3 py-2.5'
                  data-testid='provider-links'
                >
                  {DNS_PROVIDER_LINKS.map(provider => (
                    <a
                      key={provider.name}
                      href={provider.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex items-center gap-1.5 text-xs text-interactive hover:underline'
                    >
                      <ExternalLink className='h-3 w-3 shrink-0' />
                      {provider.name}
                    </a>
                  ))}
                </div>
              )}
            </ContentSurfaceCard>

            {/* Propagation note */}
            <p className='text-xs text-tertiary-token'>
              DNS changes can take up to 48 hours to propagate worldwide. If
              verification fails, wait and try again.
            </p>

            {/* Error display */}
            {displayError && (
              <ContentSurfaceCard
                className='flex items-start gap-2.5 border-destructive/25 bg-destructive/5 p-3'
                role='alert'
                data-testid='verification-error'
              >
                <AlertCircle className='h-4 w-4 text-error shrink-0 mt-0.5' />
                <p className='text-app text-error'>{displayError}</p>
              </ContentSurfaceCard>
            )}

            {/* Actions */}
            <div className='flex items-center justify-between pt-1'>
              <StatusBadge
                variant={verificationStatus === 'pending' ? 'blue' : 'gray'}
                size='sm'
              >
                {verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
              </StatusBadge>
              <Button
                type='button'
                variant='primary'
                size='sm'
                onClick={onVerify}
                disabled={verifying}
                data-testid='check-verification-button'
              >
                {verifying ? 'Checking...' : 'Check Verification'}
              </Button>
            </div>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
