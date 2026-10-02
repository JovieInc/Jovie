import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import {
  CAPABILITY_STAGE_LABEL,
  type CapabilityEvidenceRecord,
  type CapabilityObservation,
  deriveCapabilityStage,
} from '@/lib/admin/capability-evidence';

const REPOSITORY_URL = 'https://github.com/JovieInc/Jovie';

const NOT_MEASURED = 'n/a';

function formatObservation(observation: CapabilityObservation): string {
  if (observation.error) return 'source error';
  if (!observation.measured) return NOT_MEASURED;
  const count = (observation.count ?? 0).toLocaleString('en-US');
  const latest = observation.latestAt
    ? ` · latest ${observation.latestAt}`
    : '';
  return `${count} in ${observation.windowDays}d${observation.stale ? ' · stale' : ''}${latest}`;
}

function formatDeployment(record: CapabilityEvidenceRecord): string {
  const { commitSha, version, environment } = record.deployment;
  if (!commitSha) return NOT_MEASURED;
  const sha = commitSha.slice(0, 7);
  const base = version ? `${version} ${sha}` : sha;
  return environment ? `${base} (${environment})` : base;
}

export function CapabilityEvidenceMatrix({
  record,
}: Readonly<{ readonly record: CapabilityEvidenceRecord }>) {
  const stage = deriveCapabilityStage(record);
  const { certification, deployment } = record;
  const commitUrl = deployment.commitSha
    ? `${REPOSITORY_URL}/commit/${deployment.commitSha}`
    : null;
  const digest = certification?.decisionEvidenceDigest.slice(0, 12) ?? null;

  return (
    <ContentSurfaceCard
      surface='details'
      data-testid='capability-evidence-matrix'
      data-stage={stage}
      data-capability={record.capabilityId}
    >
      <div className='space-y-3 p-3'>
        <div>
          <h2 className='line-clamp-2 text-app font-semibold text-primary-token'>
            {record.title}
          </h2>
          <p className='text-2xs text-tertiary-token'>
            {record.capabilityId} · {record.subjectId} · {record.goldenPath}
          </p>
        </div>
        <div
          className='grid gap-2 sm:grid-cols-2'
          data-testid='capability-evidence-rows'
        >
          <ContentMetricRow
            label='Stage'
            value={CAPABILITY_STAGE_LABEL[stage]}
          />
          <ContentMetricRow
            label='Certified'
            value={
              certification
                ? `${certification.state} (${certification.readiness})`
                : NOT_MEASURED
            }
          />
          <ContentMetricRow
            label='Evidence Rev'
            value={digest ? `${digest}…` : NOT_MEASURED}
          />
          <ContentMetricRow
            label='Deployed Build'
            value={formatDeployment(record)}
          />
          <ContentMetricRow
            label='Configured Rollout'
            value={record.rollout.gate ?? 'Ungated'}
          />
          <ContentMetricRow
            label='Observed Exposure'
            value={formatObservation(record.exposure)}
          />
          <ContentMetricRow
            label='Observed Outcome'
            value={formatObservation(record.outcome)}
          />
          <ContentMetricRow
            label='Running Client'
            value={record.clientSha ? record.clientSha.slice(0, 7) : 'unknown'}
          />
        </div>
        <p className='min-h-4 break-words text-2xs leading-4 text-tertiary-token'>
          Exposure: {record.exposure.population}
          {record.outcome.measured
            ? ` · Outcome: ${record.outcome.population}`
            : ''}
        </p>
        <div className='flex flex-wrap gap-3 text-2xs font-medium'>
          <a
            className='text-secondary-token hover:text-primary-token'
            href={APP_ROUTES.ADMIN_FEATURES}
          >
            Feature registry →
          </a>
          <a
            className='text-secondary-token hover:text-primary-token'
            href={APP_ROUTES.ADMIN_RELEASES}
          >
            Release entities →
          </a>
          {commitUrl ? (
            <a
              className='text-secondary-token hover:text-primary-token'
              href={commitUrl}
              target='_blank'
              rel='noreferrer'
            >
              Deployed commit →
            </a>
          ) : null}
          <a
            className='text-secondary-token hover:text-primary-token'
            href={`${REPOSITORY_URL}/blob/main/${certification?.sourcePath ?? 'docs/FEATURE_REGISTRY.md'}`}
            target='_blank'
            rel='noreferrer'
          >
            Registry source →
          </a>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
