import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AgentAcquisition } from '@/lib/agent-acquisition/draft-contract';
import type { AgentVisibilityDraftPreview } from '@/lib/agent-acquisition/draft-preview';

/** Private draft artifacts, not artist accounts or published creator profiles. */
export const agentVisibilityDrafts = pgTable(
  'agent_visibility_drafts',
  {
    id: uuid('id').primaryKey(),
    artistId: text('artist_id').notNull(),
    capabilityHash: text('capability_hash').notNull(),
    preview: jsonb('preview').$type<AgentVisibilityDraftPreview>().notNull(),
    acquisition: jsonb('acquisition').$type<AgentAcquisition>().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    expiresAtIdx: index('agent_visibility_drafts_expires_at_idx').on(
      table.expiresAt
    ),
  })
);
