import type { VisibilityAuditReport } from '@/lib/visibility-audit/types';

function FixDetail({
  fix,
}: {
  readonly fix: VisibilityAuditReport['fixes'][number];
}) {
  if (fix.agenticFix.kind === 'submission') {
    return (
      <span>
        Submission {fix.agenticFix.providerId}
        {fix.agenticFix.ready ? '' : ' (mapped, not preparable)'}
      </span>
    );
  }
  if (fix.agenticFix.kind === 'dsp_bio_sync') {
    return <span>DSP bio sync: {fix.agenticFix.providerIds.join(', ')}</span>;
  }
  return <span>Manual: {fix.agenticFix.action}</span>;
}

export function VisibilityAuditReportView({
  report,
}: {
  readonly report: VisibilityAuditReport;
}) {
  return (
    <article
      className='mx-auto flex max-w-3xl flex-col gap-8'
      data-testid='visibility-audit-report'
    >
      <header className='flex flex-col gap-2'>
        <h2 className='text-xl font-semibold text-primary-token'>
          {report.title}
        </h2>
        <p className='text-sm text-secondary-token'>
          {report.artistName} · {report.profileUrl}
        </p>
        <p className='text-sm text-secondary-token'>{report.creditNote}</p>
        {report.evidenceNote ? (
          <p className='text-sm text-secondary-token'>{report.evidenceNote}</p>
        ) : null}
      </header>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>Identity</h3>
        <ul className='flex flex-col gap-1 text-sm text-secondary-token'>
          {report.identity.steps.map(step => (
            <li key={step.id}>
              {step.label}: {step.status}
              {step.values.length > 0 ? ` (${step.values.join(', ')})` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>
          DSP Presence ({report.dspPresence.presentCount} Of{' '}
          {report.dspPresence.registryCount})
        </h3>
        <ul className='flex flex-col gap-1 text-sm text-secondary-token'>
          {report.dspPresence.platforms.map(row => (
            <li key={row.key}>
              {row.name}: {row.present ? 'present' : 'missing'}
            </li>
          ))}
        </ul>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>
          Link-in-bio Graph
        </h3>
        {report.linkGraph.conflicts.length === 0 ? (
          <p className='text-sm text-secondary-token'>No conflicts recorded.</p>
        ) : (
          <ul className='flex flex-col gap-1 text-sm text-secondary-token'>
            {report.linkGraph.conflicts.map(conflict => (
              <li key={conflict.summary}>{conflict.summary}</li>
            ))}
          </ul>
        )}
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>
          Google Page-1 Ownership
        </h3>
        <p className='text-sm text-secondary-token'>
          {report.searchOwnership.instruction}
        </p>
        <p className='text-sm text-secondary-token'>
          SerpAPI requests: {report.searchOwnership.serpApiRequests}
        </p>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>
          Answer-engine Citations
        </h3>
        <p className='text-sm text-secondary-token'>
          {report.citations.disclosure}
        </p>
        <ul className='flex flex-col gap-1 text-sm text-secondary-token'>
          {report.citations.questions.map(question => (
            <li key={question.question}>
              {question.question}:{' '}
              {question.checks.length === 0
                ? 'not checked'
                : `${question.checks.length} manual`}
            </li>
          ))}
        </ul>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>
          Catalog Mismatches
        </h3>
        <p className='text-sm text-secondary-token'>{report.catalog.policy}</p>
        <p className='text-sm text-secondary-token'>
          {report.catalog.mismatches.length} row
          {report.catalog.mismatches.length === 1 ? '' : 's'}
        </p>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>Ad Pixels</h3>
        <ul className='flex flex-col gap-1 text-sm text-secondary-token'>
          {report.pixels.rows.map(row => (
            <li key={row.platform}>
              {row.platform}: {row.present ? 'present' : 'missing'}
            </li>
          ))}
        </ul>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-semibold text-primary-token'>
          Prioritized Fixes
        </h3>
        <ol className='flex flex-col gap-2 text-sm text-secondary-token'>
          {report.fixes.map(fix => (
            <li key={fix.priority}>
              <p className='font-medium text-primary-token'>{fix.title}</p>
              <p>
                <FixDetail fix={fix} />
              </p>
              <p>{fix.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
