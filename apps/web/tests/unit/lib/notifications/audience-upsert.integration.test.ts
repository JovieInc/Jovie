import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createFingerprint } from '@/app/api/audience/lib/audience-utils';
import { db } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import { audienceMembers } from '@/lib/db/schema/analytics';

const CREATOR_PROFILE_ID = 'a96b46e1-1250-4e7c-98b2-9e271eb72c37';

const hasRealDatabase =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL?.includes('dummy');

describe('audience upsert via db client', () => {
  it.skipIf(!hasRealDatabase)(
    'inserts a subscriber row using core columns only',
    async () => {
      const runId = Date.now().toString();
      const email = `fan-capture-integration+${runId}@test.jov.ie`;
      const fingerprint = createFingerprint('127.0.0.1', `vitest-${runId}`);
      const now = new Date();

      try {
        await db.execute(drizzleSql`
        INSERT INTO audience_members (
          creator_profile_id,
          fingerprint,
          type,
          display_name,
          first_seen_at,
          last_seen_at,
          visits,
          engagement_score,
          intent_level,
          device_type,
          referrer_history,
          latest_actions,
          email,
          tags,
          created_at,
          updated_at
        ) VALUES (
          ${CREATOR_PROFILE_ID},
          ${fingerprint},
          'email',
          'Subscriber',
          ${now},
          ${now},
          0,
          0,
          'low',
          'unknown',
          '[]'::jsonb,
          '[]'::jsonb,
          ${email},
          '[]'::jsonb,
          ${now},
          ${now}
        )
        ON CONFLICT (creator_profile_id, fingerprint)
        DO UPDATE SET
          type = 'email',
          email = EXCLUDED.email,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = EXCLUDED.updated_at
      `);

        const [row] = await db
          .select({ id: audienceMembers.id })
          .from(audienceMembers)
          .where(
            and(
              eq(audienceMembers.creatorProfileId, CREATOR_PROFILE_ID),
              eq(audienceMembers.email, email)
            )
          )
          .limit(1);

        expect(row?.id).toBeTruthy();
      } catch (error) {
        throw new Error(getDeepErrorMessage(error));
      } finally {
        await db
          .delete(audienceMembers)
          .where(
            and(
              eq(audienceMembers.creatorProfileId, CREATOR_PROFILE_ID),
              eq(audienceMembers.email, email)
            )
          );
      }
    }
  );
});
