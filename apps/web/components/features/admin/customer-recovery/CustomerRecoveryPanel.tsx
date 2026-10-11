import { Badge, Input } from '@jovie/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';
import type {
  CustomerRecoveryDossier,
  CustomerRecoveryResult,
} from '@/lib/admin/customer-recovery';
import { RerunIngestionButton } from './RerunIngestionButton';

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='min-w-0'>
      <dt className='text-app text-tertiary-token'>{label}</dt>
      <dd className='text-app truncate font-medium text-primary-token'>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function DossierSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <ContentSurfaceCard surface='nested'>
      <div className='space-y-3 p-4'>
        <h3 className='text-app font-semibold text-secondary-token'>{title}</h3>
        {children}
      </div>
    </ContentSurfaceCard>
  );
}

function DossierView({ dossier }: { dossier: CustomerRecoveryDossier }) {
  const { identity, account, authority, admission, blocker } = dossier;
  return (
    <div
      className='grid gap-3 lg:grid-cols-2'
      data-testid='customer-recovery-dossier'
    >
      <DossierSection title='Identity'>
        <dl className='grid grid-cols-2 gap-3'>
          <Fact label='Name' value={identity.displayName} />
          <Fact label='Email' value={identity.email} />
          <Fact label='Handle' value={identity.handle} />
          <Fact label='Stage' value={identity.stage} />
          <Fact label='User' value={identity.userId} />
          <Fact label='Creator Profile' value={identity.creatorProfileId} />
          <Fact label='Lead' value={identity.leadId} />
          <Fact label='Waitlist Entry' value={identity.waitlistEntryId} />
        </dl>
        <div className='flex flex-wrap gap-1'>
          {identity.sources.map(source => (
            <Badge key={source} variant='secondary'>
              {source}
            </Badge>
          ))}
        </div>
      </DossierSection>

      <DossierSection title='Account and admission'>
        <dl className='grid grid-cols-2 gap-3'>
          <Fact
            label='Plan'
            value={
              account
                ? `${account.plan ?? 'free'}${account.isPro ? ' (pro flag)' : ''}`
                : 'no account'
            }
          />
          <Fact
            label='Paying'
            value={account ? (account.isPaying ? 'yes' : 'no') : '—'}
          />
          <Fact label='User Status' value={account?.userStatus} />
          <Fact
            label='Admission'
            value={admission ? admission.status : 'not on waitlist'}
          />
          <Fact label='Approved' value={admission?.approvedAt} />
          <Fact label='Signed Up' value={admission?.signedUpAt} />
        </dl>
      </DossierSection>

      <DossierSection title='Authority and connections'>
        <dl className='grid grid-cols-2 gap-3'>
          <Fact
            label='Artist-managed'
            value={authority ? (authority.profileClaimed ? 'yes' : 'no') : '—'}
          />
          <Fact label='Claimed At' value={authority?.claimedAt} />
          <Fact
            label='Verified'
            value={authority ? (authority.isVerified ? 'yes' : 'no') : '—'}
          />
          <Fact
            label='Social Links'
            value={String(dossier.connections.activeSocialLinks)}
          />
          <Fact
            label='Releases'
            value={dossier.launch ? String(dossier.launch.releaseCount) : '—'}
          />
          <Fact
            label='Latest Release'
            value={dossier.launch?.latestReleaseTitle}
          />
        </dl>
      </DossierSection>

      <DossierSection title='Blocker and next action'>
        <p className='text-app text-primary-token'>{blocker.summary}</p>
        {authority && (
          <dl className='grid grid-cols-2 gap-3'>
            <Fact label='Ingestion Status' value={authority.ingestionStatus} />
            <Fact label='Last Error' value={authority.lastIngestionError} />
          </dl>
        )}
        {blocker.operation === 'rerun-ingestion' &&
          identity.creatorProfileId && (
            <RerunIngestionButton
              creatorProfileId={identity.creatorProfileId}
            />
          )}
        {blocker.preconditionNote && (
          <p className='text-app text-secondary-token'>
            {blocker.preconditionNote}
          </p>
        )}
      </DossierSection>

      <DossierSection title='Recent operations'>
        {dossier.recentOperations.length === 0 ? (
          <p className='text-app text-secondary-token'>
            No ingest operations recorded for this customer.
          </p>
        ) : (
          <ul className='space-y-1'>
            {dossier.recentOperations.map(op => (
              <li
                key={`${op.type}-${op.createdAt}`}
                className='text-app flex items-center justify-between gap-2 text-secondary-token'
              >
                <span className='truncate'>
                  {op.type}
                  {op.failureReason ? ` — ${op.failureReason}` : ''}
                </span>
                <span className='shrink-0 tabular-nums'>
                  {op.result ?? '—'} · {op.createdAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DossierSection>
    </div>
  );
}

/**
 * Evidence-backed customer recovery inspector (JOV-7482). Search resolves
 * the canonical contact; the dossier shows independently observed facts and
 * the one supported safe repair. `generatedAt` keeps source freshness visible.
 */
export function CustomerRecoveryPanel({
  result,
}: {
  result: CustomerRecoveryResult;
}) {
  return (
    <div className='space-y-4' data-testid='customer-recovery-panel'>
      <form
        method='get'
        className='flex items-center gap-2'
        data-testid='customer-recovery-search'
      >
        <input type='hidden' name='view' value='recovery' />
        <Input
          name='q'
          defaultValue={result.search}
          placeholder='Search email, handle, or linked ID…'
          aria-label='Customer Identifier'
          autoComplete='off'
          className='max-w-sm'
        />
        <button
          type='submit'
          className='inline-flex items-center gap-1 text-app text-secondary-token hover:text-primary-token'
        >
          <Search className='h-4 w-4' aria-hidden /> Search
        </button>
      </form>

      {result.matches.length > 1 && (
        <div className='space-y-1' data-testid='customer-recovery-matches'>
          <p className='text-app text-tertiary-token'>
            Select the linked customer:
          </p>
          <ul className='space-y-1'>
            {result.matches.map(match => (
              <li key={match.dedupeKey}>
                <Link
                  href={buildAdminPeopleHref(
                    'recovery',
                    new URLSearchParams({
                      q: result.search,
                      key: match.dedupeKey,
                    })
                  )}
                  className='text-app text-secondary-token underline-offset-2 hover:underline'
                >
                  {match.displayName ??
                    match.email ??
                    match.handle ??
                    'Unknown'}{' '}
                  <span className='text-tertiary-token'>
                    ({match.stage}
                    {match.email ? ` · ${match.email}` : ''})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.error === 'unavailable' && (
        <p
          className='text-app text-secondary-token'
          role='status'
          data-testid='customer-recovery-error'
        >
          Customer recovery evidence is temporarily unavailable. Try the search
          again.
        </p>
      )}

      {!result.error && result.search && result.matches.length === 0 && (
        <p className='text-app text-secondary-token'>
          No canonical customer matches “{result.search}”.
        </p>
      )}

      {result.dossier && <DossierView dossier={result.dossier} />}

      <p className='text-app text-tertiary-token'>
        Evidence snapshot generated {result.generatedAt}. Recovery state is
        confirmed by reading this dossier back after an action — the button
        receipt marks “requested”, not recovered.
      </p>
    </div>
  );
}
