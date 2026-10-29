import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Links a Sentry Session Replay to the person it recorded (internal only).
 *
 * The browser reports the replay id of its own session; the server attaches
 * whichever identity it can verify at that moment: the signed anonymous
 * onboarding session (pre-account) and, once signed in, the user. One replay
 * id is one browser session, so later reports for the same id only fill in
 * missing identity. Read only by internal Summer/Ovie endpoints; never
 * rendered to users.
 */
export const signupReplays = pgTable(
  'signup_replays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sentryReplayId: text('sentry_replay_id').notNull().unique(),
    onboardingSessionId: text('onboarding_session_id'),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    /** Why the buffered replay was sent (see lib/sentry/replay-start.ts). */
    flushTrigger: text('flush_trigger'),
    /** Set when the buffer was flushed; counts against the monthly cap. */
    flushedAt: timestamp('flushed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    userIdx: index('signup_replays_user_id_idx').on(table.userId),
    flushedAtIdx: index('signup_replays_flushed_at_idx').on(table.flushedAt),
    sessionIdx: index('signup_replays_onboarding_session_id_idx').on(
      table.onboardingSessionId
    ),
  })
);

export type SignupReplayRow = typeof signupReplays.$inferSelect;
