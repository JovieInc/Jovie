import 'server-only';

import { desc, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investorLinks, investorViews } from '@/lib/db/schema/investors';

export type AdminInvestorPipelineRow = Awaited<
  ReturnType<typeof loadAdminInvestorPipelineData>
>[number];

export async function loadAdminInvestorPipelineData() {
  return db
    .select({
      id: investorLinks.id,
      token: investorLinks.token,
      label: investorLinks.label,
      investorName: investorLinks.investorName,
      email: investorLinks.email,
      stage: investorLinks.stage,
      engagementScore: investorLinks.engagementScore,
      isActive: investorLinks.isActive,
      notes: investorLinks.notes,
      createdAt: investorLinks.createdAt,
      updatedAt: investorLinks.updatedAt,
      viewCount:
        drizzleSql<number>`(SELECT COUNT(*) FROM ${investorViews} WHERE ${investorViews.investorLinkId} = ${investorLinks.id})`.as(
          'view_count'
        ),
      lastViewed: drizzleSql<
        string | null
      >`(SELECT MAX(${investorViews.viewedAt}) FROM ${investorViews} WHERE ${investorViews.investorLinkId} = ${investorLinks.id})`.as(
        'last_viewed'
      ),
    })
    .from(investorLinks)
    .orderBy(desc(investorLinks.createdAt));
}
