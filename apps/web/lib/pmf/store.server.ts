import 'server-only';

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import {
  activatedUserSql,
  isAdmittedUserStatus,
} from '@/lib/activation/admitted-activation';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  type PmfSurveyResponse,
  pmfSurveyResponses,
} from '@/lib/db/schema/pmf-survey';
import { isPmfSurveyEligible } from './eligibility';

export const PMF_MAIN_BENEFIT_MAX_LENGTH = 1000;

export interface PmfSurveyAnswerInput {
  readonly userId: string;
  readonly response: PmfSurveyResponse;
  readonly mainBenefit: string | null;
  readonly now: Date;
}

/**
 * Whether the user should see the PMF prompt now. One indexed read: the
 * user's status, whether a profile they own finished onboarding, and their
 * survey row if any.
 */
export async function isPmfSurveyEligibleForUser(input: {
  readonly userId: string;
  readonly now: Date;
}): Promise<boolean> {
  const [row] = await db
    .select({
      userStatus: users.userStatus,
      activated: drizzleSql<boolean>`${activatedUserSql(drizzleSql`${users.id}`)}`,
      surveyId: pmfSurveyResponses.id,
      answeredAt: pmfSurveyResponses.answeredAt,
      dismissCount: pmfSurveyResponses.dismissCount,
      lastDismissedAt: pmfSurveyResponses.lastDismissedAt,
    })
    .from(users)
    .leftJoin(pmfSurveyResponses, eq(pmfSurveyResponses.userId, users.id))
    .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) return false;
  return isPmfSurveyEligible({
    admitted: isAdmittedUserStatus(row.userStatus),
    activated: row.activated === true,
    state: row.surveyId
      ? {
          answeredAt: row.answeredAt,
          dismissCount: row.dismissCount ?? 0,
          lastDismissedAt: row.lastDismissedAt,
        }
      : null,
    now: input.now,
  });
}

/**
 * Store the user's answer. One statement; an existing answer is never
 * overwritten, so a double submit keeps the first answer.
 */
export async function recordPmfSurveyAnswer(
  input: PmfSurveyAnswerInput
): Promise<{ readonly stored: boolean }> {
  const mainBenefit = normalizeMainBenefit(input.mainBenefit);
  const rows = await db
    .insert(pmfSurveyResponses)
    .values({
      userId: input.userId,
      response: input.response,
      mainBenefit,
      answeredAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: pmfSurveyResponses.userId,
      set: {
        response: input.response,
        mainBenefit,
        answeredAt: input.now,
        updatedAt: input.now,
      },
      setWhere: isNull(pmfSurveyResponses.answeredAt),
    })
    .returning({ id: pmfSurveyResponses.id });
  return { stored: rows.length > 0 };
}

/** Count a dismissal. Ignored once the user has answered. */
export async function recordPmfSurveyDismissal(input: {
  readonly userId: string;
  readonly now: Date;
}): Promise<{ readonly stored: boolean }> {
  const rows = await db
    .insert(pmfSurveyResponses)
    .values({
      userId: input.userId,
      dismissCount: 1,
      lastDismissedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: pmfSurveyResponses.userId,
      set: {
        dismissCount: drizzleSql`${pmfSurveyResponses.dismissCount} + 1`,
        lastDismissedAt: input.now,
        updatedAt: input.now,
      },
      setWhere: isNull(pmfSurveyResponses.answeredAt),
    })
    .returning({ id: pmfSurveyResponses.id });
  return { stored: rows.length > 0 };
}

export function normalizeMainBenefit(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, PMF_MAIN_BENEFIT_MAX_LENGTH);
}
