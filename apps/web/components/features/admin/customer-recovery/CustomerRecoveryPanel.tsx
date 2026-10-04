import { Input } from '@jovie/ui';
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

function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className='grid grid-cols-2 gap-3'>
      {rows.map(([label, value]) => (
        <Fact key={label} label={label} value={value} />
      ))}
    </dl>
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
  const yesNo = (value: boolean | undefined) =>
    value === undefined ? '—' : value ? 'yes' : 'no';
  const sections: readonly [
    string,
    readonly (readonly [string, ReactNode])[],
  ][] = [
    [
      'Identity',
      [
        ['Name', identity.displayName],
        ['Email', identity.email],
        ['Handle', identity.handle],
        ['Stage', identity.stage],
        ['User', identity.userId],
        ['Creator Profile', identity.creatorProfileId],
        ['Sources', identity.sources.join(', ')],
      ],
    ],
    [
      'Account and admission',
      [
        [
          'Plan',
          account
            ? `${account.plan ?? 'free'}${account.isPro ? ' (pro flag)' : ''}`
            : 'no account',
        ],
        ['Paying', yesNo(account?.isPaying)],
        ['Admission', admission?.status ?? 'not on waitlist'],
      ],
    ],
    [
      'Authority and connections',
      [
        ['Artist-managed', yesNo(authority?.profileClaimed)],
        ['Verified', yesNo(authority?.isVerified)],
        ['Social Links', String(dossier.connections.activeSocialLinks)],
        ['Releases', dossier.launch?.releaseCount.toString()],
      ],
    ],
  ];
  return (
    <div className='grid gap-3 lg:grid-cols-2'>
      {sections.map(([title, rows]) => (
        <DossierSection key={title} title={title}>
          <Facts rows={rows} />
        </DossierSection>
      ))}

      <DossierSection title='Blocker and next action'>
        <p className='text-app text-primary-token'>{blocker.summary}</p>
        {authority && (
          <Facts
            rows={[
              ['Ingestion Status', authority.ingestionStatus],
              ['Last Error', authority.lastIngestionError],
            ]}
          />
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
          <ul className='space-y-1 text-app text-secondary-token'>
            {dossier.recentOperations.map(op => (
              <li key={`${op.type}-${op.createdAt}`}>
                {op.type}: {op.result ?? '—'} · {op.createdAt.slice(0, 10)}
                {op.failureReason ? ` — ${op.failureReason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </DossierSection>
    </div>
  );
}

export function CustomerRecoveryPanel({
  result,
}: {
  result: CustomerRecoveryResult;
}) {
  return (
    <div className='space-y-4'>
      <form method='get' className='flex items-center gap-2'>
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
        <div className='space-y-1'>
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
        <p className='text-app text-secondary-token' role='status'>
          Customer recovery evidence is temporarily unavailable. Try the search
          again.
        </p>
      )}

      {!result.error &&
        !result.dossier &&
        result.search &&
        result.matches.length === 0 && (
          <p className='text-app text-secondary-token'>
            No canonical customer matches “{result.search}”.
          </p>
        )}

      {result.dossier && <DossierView dossier={result.dossier} />}

      <p className='text-app text-tertiary-token'>
        Evidence snapshot generated {result.generatedAt}. “Requested” recovery
        is confirmed by this dossier after refresh.
      </p>
    </div>
  );
}
