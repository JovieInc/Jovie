import { avg, count, eq } from 'drizzle-orm';
import { BarChart2, CheckCircle, Search, Users } from 'lucide-react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { KpiItem } from '@/features/admin/KpiItem';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';

async function getLeadKpis() {
  const [totalRow] = await db.select({ count: count() }).from(leads);

  const [qualifiedRow] = await db
    .select({ count: count() })
    .from(leads)
    .where(eq(leads.status, 'qualified'));

  const [discoveredRow] = await db
    .select({ count: count() })
    .from(leads)
    .where(eq(leads.status, 'discovered'));

  const [ingestedRow] = await db
    .select({ count: count() })
    .from(leads)
    .where(eq(leads.status, 'ingested'));

  const [avgScoreRow] = await db
    .select({ avg: avg(leads.fitScore) })
    .from(leads)
    .where(eq(leads.status, 'qualified'));

  let settings = null;
  const [settingsRow] = await db
    .select()
    .from(leadPipelineSettings)
    .where(eq(leadPipelineSettings.id, 1))
    .limit(1);
  settings = settingsRow;

  return {
    total: totalRow?.count ?? 0,
    qualified: qualifiedRow?.count ?? 0,
    discovered: discoveredRow?.count ?? 0,
    ingested: ingestedRow?.count ?? 0,
    avgFitScore: avgScoreRow?.avg ? Math.round(Number(avgScoreRow.avg)) : 0,
    queriesUsedToday: settings?.queriesUsedToday ?? 0,
    dailyQueryBudget: settings?.dailyQueryBudget ?? 100,
    pipelineEnabled: settings?.enabled ?? false,
  };
}

export async function LeadPipelineKpis() {
  const kpis = await getLeadKpis();

  return (
    <section>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Lead pipeline'
          subtitle='Discovery volume, qualification depth, and automation health'
          className='px-5 py-3'
        />
        <div className='grid gap-4 px-5 py-4 pt-3 sm:grid-cols-2 xl:grid-cols-4'>
          <KpiItem
            title='TOTAL LEADS'
            value={String(kpis.total)}
            metadata={
              <span>
                {kpis.discovered} discovered, {kpis.ingested} ingested
              </span>
            }
            icon={Users}
          />
          <KpiItem
            title='QUALIFIED'
            value={String(kpis.qualified)}
            metadata={<span>Ready for review</span>}
            icon={CheckCircle}
            iconClassName='text-success'
          />
          <KpiItem
            title='QUERIES TODAY'
            value={`${kpis.queriesUsedToday} / ${kpis.dailyQueryBudget}`}
            metadata={
              <span>Pipeline {kpis.pipelineEnabled ? 'active' : 'paused'}</span>
            }
            icon={Search}
          />
          <KpiItem
            title='AVG FIT SCORE'
            value={String(kpis.avgFitScore)}
            metadata={<span>Across qualified leads</span>}
            icon={BarChart2}
          />
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
