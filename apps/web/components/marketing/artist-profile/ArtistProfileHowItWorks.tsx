import { CheckCircle2, QrCode, Search } from 'lucide-react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

function getProviderLabel(provider: string): string {
  if (provider === 'apple_music') return 'Apple Music';
  if (provider === 'deezer') return 'Deezer';
  return 'Spotify';
}

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell className='bg-surface-0'>
      <div className='mx-auto max-w-280'>
        <ArtistProfileSectionHeader
          align='left'
          headline={howItWorks.headline}
          body={howItWorks.body}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />

        <ol className='mt-10 grid gap-4 lg:grid-cols-3'>
          {howItWorks.steps.map((step, index) => (
            <li
              key={step.id}
              className='flex min-h-96 flex-col rounded-2xl border border-subtle bg-surface-1 p-5 sm:p-6'
            >
              <p className='font-mono text-3xs text-tertiary-token'>
                0{index + 1}
              </p>

              <div className='mt-8 flex-1'>
                {step.id === 'claim' ? (
                  <ClaimPreview howItWorks={howItWorks} />
                ) : null}
                {step.id === 'connect' ? (
                  <ConnectPreview howItWorks={howItWorks} />
                ) : null}
                {step.id === 'share' ? (
                  <SharePreview howItWorks={howItWorks} />
                ) : null}
              </div>

              <h3 className='mt-8 text-lg font-semibold tracking-tight text-primary-token'>
                {step.title}
              </h3>
              <p className='mt-3 text-app leading-relaxed text-secondary-token'>
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </ArtistProfileSectionShell>
  );
}

function ClaimPreview({
  howItWorks,
}: Readonly<{ howItWorks: ArtistProfileLandingCopy['howItWorks'] }>) {
  return (
    <div className='space-y-3'>
      <div className='flex min-h-11 items-center gap-3 rounded-lg border border-subtle bg-surface-0 px-3.5'>
        <Search className='h-4 w-4 text-tertiary-token' aria-hidden='true' />
        <span className='text-app font-medium text-primary-token'>
          {howItWorks.claim.searchValue}
        </span>
      </div>
      <div className='flex items-center gap-3 rounded-xl border border-subtle bg-surface-0 p-3'>
        <span className='flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-surface-1'>
          <ProviderIcon provider='spotify' className='h-4 w-4' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-app font-semibold text-primary-token'>
            {howItWorks.claim.resultName}
          </p>
          <p className='mt-1 text-2xs text-secondary-token'>
            {howItWorks.claim.resultSubtitle}
          </p>
        </div>
        <span className='rounded-full bg-primary-token px-3 py-1.5 text-3xs font-semibold text-surface-1'>
          {howItWorks.claim.ctaLabel}
        </span>
      </div>
      <p className='flex items-center justify-between rounded-lg border border-subtle bg-surface-0 px-3.5 py-3 font-mono text-xs text-secondary-token'>
        {howItWorks.claim.profilePath}
        <CheckCircle2 className='h-4 w-4 text-success' aria-hidden='true' />
      </p>
    </div>
  );
}

function ConnectPreview({
  howItWorks,
}: Readonly<{ howItWorks: ArtistProfileLandingCopy['howItWorks'] }>) {
  return (
    <div className='rounded-xl border border-subtle bg-surface-0 p-3.5'>
      <p className='text-app font-semibold text-primary-token'>
        {howItWorks.sync.title}
      </p>
      <p className='mt-1 text-2xs text-secondary-token'>
        {howItWorks.sync.detail}
      </p>
      <div className='mt-4 space-y-2'>
        {howItWorks.sync.providers.map(provider => (
          <div
            key={provider.provider}
            className='flex items-center justify-between rounded-lg border border-subtle bg-surface-1 px-3 py-2.5'
          >
            <span className='flex items-center gap-2.5 text-xs font-medium text-primary-token'>
              <ProviderIcon provider={provider.provider} className='h-4 w-4' />
              {getProviderLabel(provider.provider)}
            </span>
            <span
              className={cn(
                'text-3xs font-semibold',
                provider.status === 'Matched'
                  ? 'text-success'
                  : 'text-secondary-token'
              )}
            >
              {provider.status}
            </span>
          </div>
        ))}
      </div>
      <p className='mt-3 text-2xs text-tertiary-token'>
        {howItWorks.sync.otherProvidersLabel}
      </p>
    </div>
  );
}

function SharePreview({
  howItWorks,
}: Readonly<{ howItWorks: ArtistProfileLandingCopy['howItWorks'] }>) {
  return (
    <div className='rounded-xl border border-subtle bg-surface-0 p-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='font-mono text-xs text-primary-token'>
          {howItWorks.share.displayValue}
        </p>
        <span className='flex h-10 w-10 items-center justify-center rounded-lg border border-subtle bg-surface-1 text-secondary-token'>
          <QrCode className='h-4 w-4' aria-hidden='true' />
        </span>
      </div>
      <div className='mt-5 border-t border-subtle pt-4'>
        <p className='text-3xs font-semibold text-tertiary-token'>
          {howItWorks.share.deepLinksLabel}
        </p>
        <div className='mt-3 space-y-2'>
          {howItWorks.share.deepLinks.slice(0, 3).map(link => (
            <p key={link} className='font-mono text-2xs text-secondary-token'>
              {link}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
