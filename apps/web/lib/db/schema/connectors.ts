/**
 * AI Connector Schema (v1)
 *
 * Defines the 8 tables that power the AI Connector magic moment:
 * Gmail booking email → extracted signal → suggested calendar event → DJ approves → Google Calendar entry.
 *
 * Design invariants:
 * - `encryptedAccessToken` / `encryptedRefreshToken` are ALWAYS written via `token-vault.ts`; never raw.
 * - `external_objects.payload` must contain ONLY redacted/normalized data — never raw email bodies.
 * - `suggested_actions` status transitions are CAS-enforced in the app layer (pending→approved→executed).
 * - `workflow_runs` is intentionally separate from `ingestionJobs`; the latter's enum cannot host
 *   `waiting_for_approval`.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import {
  agentRunStatusEnum,
  connectorProviderEnum,
  connectorStatusEnum,
  contextFactKindEnum,
  suggestedActionStatusEnum,
  webhookProviderEnum,
  workflowRunStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// ---------------------------------------------------------------------------
// connector_accounts
// ---------------------------------------------------------------------------

/**
 * One row per (user, provider) OAuth connection.
 * Stores encrypted tokens via token-vault.ts — never write to
 * `encryptedAccessToken` / `encryptedRefreshToken` directly in app code.
 * Split error fields (`lastErrorCode`, `lastErrorDevMessage`, `lastErrorUserMessage`)
 * let the UI show user-friendly copy while Sentry captures the developer context.
 */
export const connectorAccounts = pgTable(
  'connector_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),

    provider: connectorProviderEnum('provider').notNull(),
    status: connectorStatusEnum('status').notNull().default('connected'),

    /** OAuth scopes granted at authorization time. */
    scopes: text('scopes').array().notNull().default([]),

    /** Provider-side account identifier (e.g. Gmail address). */
    providerAccountId: text('provider_account_id').notNull(),

    /** AES-256-GCM encrypted via encryptPII(). Read/write through token-vault.ts only. */
    encryptedAccessToken: text('encrypted_access_token'),
    /** AES-256-GCM encrypted via encryptPII(). Read/write through token-vault.ts only. */
    encryptedRefreshToken: text('encrypted_refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),

    /** Machine-readable error code — safe for Sentry tags and metrics. */
    lastErrorCode: text('last_error_code'),
    /** Developer/Sentry context — not shown in UI. */
    lastErrorDevMessage: text('last_error_dev_message'),
    /** User-facing copy rendered in the Connectors settings card. */
    lastErrorUserMessage: text('last_error_user_message'),

    /**
     * Connector-specific capability flags (e.g. {"canWrite": true}).
     * Checked before write operations so the app degrades gracefully
     * if only read-only scopes were granted.
     */
    capabilities: jsonb('capabilities').notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('connector_accounts_user_provider_account_uniq').on(
      t.userId,
      t.provider,
      t.providerAccountId
    ),
  ]
);

export type ConnectorAccount = typeof connectorAccounts.$inferSelect;
export type NewConnectorAccount = typeof connectorAccounts.$inferInsert;
export const insertConnectorAccountSchema =
  createInsertSchema(connectorAccounts);
export const selectConnectorAccountSchema =
  createSelectSchema(connectorAccounts);

// ---------------------------------------------------------------------------
// connector_sync_states
// ---------------------------------------------------------------------------

/**
 * Per (connector_account, resource_kind) incremental sync cursor.
 * Stores the provider's opaque sync token (Calendar) or historyId (Gmail)
 * to support cheap incremental fetches instead of full re-scans.
 * `tokenRefreshLockedUntil` is a row-level CAS refresh lock — only one
 * caller may refresh the OAuth token at a time (prevents parallel token churn).
 */
export const connectorSyncStates = pgTable(
  'connector_sync_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectorAccountId: uuid('connector_account_id')
      .notNull()
      .references(() => connectorAccounts.id, { onDelete: 'cascade' }),

    /**
     * Logical resource being synced, e.g. `calendar_events` or `gmail_messages`.
     * Text rather than enum to stay extensible without migrations.
     */
    resourceKind: text('resource_kind').notNull(),

    /** Google Calendar sync token from the previous list response. */
    syncToken: text('sync_token'),
    /** Gmail historyId from the previous history.list response. */
    historyId: text('history_id'),
    /** Arbitrary JSON cursor for providers that use page-token / keyset pagination. */
    cursor: jsonb('cursor'),

    lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
    lastIncrementalSyncAt: timestamp('last_incremental_sync_at', {
      withTimezone: true,
    }),

    /**
     * Row-level CAS refresh lock. Token refresh callers SET this to
     * `now() + lock_duration` WHERE `lockedUntil IS NULL OR lockedUntil < now()`.
     * On failed CAS, throw `RefreshLockBusyError` and retry later.
     */
    tokenRefreshLockedUntil: timestamp('token_refresh_locked_until', {
      withTimezone: true,
    }),
  },
  t => [
    uniqueIndex('connector_sync_states_account_kind_uniq').on(
      t.connectorAccountId,
      t.resourceKind
    ),
  ]
);

export type ConnectorSyncState = typeof connectorSyncStates.$inferSelect;
export type NewConnectorSyncState = typeof connectorSyncStates.$inferInsert;
export const insertConnectorSyncStateSchema =
  createInsertSchema(connectorSyncStates);
export const selectConnectorSyncStateSchema =
  createSelectSchema(connectorSyncStates);

// ---------------------------------------------------------------------------
// external_objects
// ---------------------------------------------------------------------------

/**
 * Normalized provider objects fetched during sync.
 * SECURITY: `payload` must NEVER contain raw email bodies, raw thread content,
 * or any PII beyond what is strictly necessary for signal extraction.
 * Callers must redact / normalize before writing (e.g. strip body, keep subject + metadata).
 * The `etag` field enables cheap `If-None-Match` skips on re-fetch.
 */
export const externalObjects = pgTable(
  'external_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectorAccountId: uuid('connector_account_id')
      .notNull()
      .references(() => connectorAccounts.id, { onDelete: 'cascade' }),

    provider: connectorProviderEnum('provider').notNull(),

    /**
     * Object type within the provider, e.g. `calendar_event` or `gmail_message`.
     * Text (not enum) so new object types don't require a migration.
     */
    kind: text('kind').notNull(),

    /** Provider-assigned identifier (e.g. Google Calendar eventId or Gmail messageId). */
    providerId: text('provider_id').notNull(),

    /**
     * Redacted/normalized provider payload.
     * For Gmail: subject, from, date, labels only — never body text.
     * For Calendar: title, times, attendees count — no description.
     */
    payload: jsonb('payload').notNull(),

    /** HTTP ETag or provider version string for change detection. */
    etag: text('etag'),

    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('external_objects_account_kind_provider_uniq').on(
      t.connectorAccountId,
      t.kind,
      t.providerId
    ),
    index('external_objects_account_kind_fetched_idx').on(
      t.connectorAccountId,
      t.kind,
      t.fetchedAt
    ),
  ]
);

export type ExternalObject = typeof externalObjects.$inferSelect;
export type NewExternalObject = typeof externalObjects.$inferInsert;
export const insertExternalObjectSchema = createInsertSchema(externalObjects);
export const selectExternalObjectSchema = createSelectSchema(externalObjects);

// ---------------------------------------------------------------------------
// webhook_deliveries
// ---------------------------------------------------------------------------

/**
 * At-least-once deduplification for inbound webhook pushes.
 * Before processing any Google Calendar push or Gmail Pub/Sub message,
 * callers must INSERT with ON CONFLICT DO NOTHING and check rows returned.
 * If 0 rows returned, the message was already processed — skip.
 * `payloadHash` helps detect replays with mutated payloads (defense-in-depth).
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: webhookProviderEnum('provider').notNull(),

    /** Opaque provider message ID (e.g. Google Pub/Sub message ID). */
    providerMessageId: text('provider_message_id').notNull(),

    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Set when processing completes successfully; null means in-flight or failed. */
    processedAt: timestamp('processed_at', { withTimezone: true }),

    /** SHA-256 of the raw payload for replay-mutation detection. */
    payloadHash: text('payload_hash'),
  },
  t => [
    uniqueIndex('webhook_deliveries_provider_message_uniq').on(
      t.provider,
      t.providerMessageId
    ),
  ]
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export const insertWebhookDeliverySchema =
  createInsertSchema(webhookDeliveries);
export const selectWebhookDeliverySchema =
  createSelectSchema(webhookDeliveries);

// ---------------------------------------------------------------------------
// context_facts
// ---------------------------------------------------------------------------

/**
 * Derived signals produced by the extractor from normalized `external_objects`.
 * Each fact has a `kind` that determines how downstream agents consume it.
 * `confidence` (0.00–1.00) is the extractor's self-reported extraction confidence,
 * used to filter low-confidence signals before surfacing `suggested_actions`.
 * `expiresAt` allows time-bounded facts (e.g. event signals after the event date).
 */
export const contextFacts = pgTable('context_facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  kind: contextFactKindEnum('kind').notNull(),

  /** The `external_objects` row that was the primary source for this fact, if any. */
  sourceObjectId: uuid('source_object_id').references(
    () => externalObjects.id,
    { onDelete: 'set null' }
  ),

  /**
   * Array of all source references (messageIds, eventIds, etc.) that contributed
   * to this fact. Enables tracing a suggestion back to specific provider objects.
   */
  sourceRefs: jsonb('source_refs').notNull().default([]),

  /** Structured signal data. Schema varies by `kind`. */
  data: jsonb('data').notNull(),

  /** Extractor confidence score from 0.00 to 1.00. */
  confidence: numeric('confidence', { precision: 3, scale: 2 }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export type ContextFact = typeof contextFacts.$inferSelect;
export type NewContextFact = typeof contextFacts.$inferInsert;
export const insertContextFactSchema = createInsertSchema(contextFacts);
export const selectContextFactSchema = createSelectSchema(contextFacts);

// ---------------------------------------------------------------------------
// agent_runs  (declared before suggested_actions to avoid forward-reference)
// ---------------------------------------------------------------------------

/**
 * Audit log for every agent invocation (extraction, approval-gate check, etc.).
 * `inputContextDigest` stores a hash of the input context — never the raw context
 * which may contain PII. `prompt` stores the rendered prompt after token redaction.
 * The admin debug page at `/app/admin/agent-runs/[id]` reads these rows.
 */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    agentSlug: text('agent_slug').notNull(),

    /**
     * What triggered this run: `cron`, `workflow`, `user` (manual dev button),
     * or `webhook` (push notification).
     */
    triggerKind: text('trigger_kind').notNull(),

    status: agentRunStatusEnum('status').notNull().default('queued'),

    /** SHA-256 of the input context bundle. Never store raw context here. */
    inputContextDigest: text('input_context_digest').notNull(),

    model: text('model'),

    /** Rendered prompt with PII tokens already redacted by token-vault. */
    prompt: text('prompt'),

    /** Array of tool call records (name, input schema, output schema). */
    toolCalls: jsonb('tool_calls').notNull().default([]),

    /** Provider-reported token usage (promptTokens, completionTokens, totalTokens). */
    tokenUsage: jsonb('token_usage'),

    /** Estimated USD cost of this run, calculated from token usage + model pricing. */
    cost: numeric('cost', { precision: 10, scale: 4 }).default('0'),

    error: text('error'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  t => [
    index('agent_runs_user_slug_status_started_idx').on(
      t.userId,
      t.agentSlug,
      t.status,
      t.startedAt
    ),
  ]
);

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export const insertAgentRunSchema = createInsertSchema(agentRuns);
export const selectAgentRunSchema = createSelectSchema(agentRuns);

// ---------------------------------------------------------------------------
// suggested_actions
// ---------------------------------------------------------------------------

/**
 * Proposed side effects that require creator approval before execution.
 * The `id` field doubles as the Google Calendar `event.id` (via `idempotencyKey`)
 * so retries are at-most-once at the provider level.
 *
 * CAS enforcement (app layer, never enforced here):
 *   pending → approved: `WHERE status = 'pending' AND userId = :userId`
 *   approved → executed: `WHERE status = 'approved' AND approvalId = :id`
 * A 0-row UPDATE means the state has already moved on — return 409.
 *
 * `sideEffects` is empty in v1; v1.1 fills it with fan-facing
 * termination descriptors ({kind, tourPageSlug, fanCount}).
 */
export const suggestedActions = pgTable(
  'suggested_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The agent run that produced this suggestion. */
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),

    /**
     * Action type. Starts with `calendar.create_event`.
     * Future values: `tour_page.update`, `fan_notification.send`.
     * Text (not enum) so v1.1 bolt-on requires no migration.
     */
    kind: text('kind').notNull(),

    /** The connector account that will execute this action (e.g. write to Calendar). */
    targetConnectorAccountId: uuid('target_connector_account_id').references(
      () => connectorAccounts.id,
      { onDelete: 'set null' }
    ),

    /** Action payload. Schema varies by `kind`. */
    payload: jsonb('payload').notNull(),

    /**
     * Typed inbox category: `new_song` | `new_event` | `new_profile_match` |
     * `other`. Text (not enum) so new detector types require no migration.
     * Nullable: legacy rows are classified at read time by
     * `classifyOpportunitySignalType`; detectors set it explicitly at insert.
     */
    signalType: text('signal_type'),

    status: suggestedActionStatusEnum('status').notNull().default('pending'),

    /** Source `context_facts` and `external_objects` refs that justify this suggestion. */
    sourceRefs: jsonb('source_refs').notNull().default([]),

    /** Human-readable explanation of why this action was suggested (shown in approval card). */
    rationale: text('rationale'),

    /**
     * Deterministic idempotency key derived from `id` at insert time.
     * Used as the Google Calendar `event.id` to make `createEvent` at-most-once:
     * Google returns 409 on duplicate event.id, which the executor treats as success.
     */
    idempotencyKey: text('idempotency_key').notNull(),

    /**
     * Fan-facing side effects to execute alongside the primary action (v1: always []).
     * v1.1 fills with [{kind: 'tour_page_update', tourPageSlug, fanCount}, ...].
     */
    sideEffects: jsonb('side_effects').notNull().default([]),

    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    executionResult: jsonb('execution_result'),

    /**
     * When the detector emitted this opportunity (opportunity lifecycle start).
     * Backfilled as `created_at` for pre-existing rows (labeled assumption).
     * Cycle time = linked run's `shipped_at` − `detected_at`.
     */
    detectedAt: timestamp('detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index('suggested_actions_user_status_created_idx').on(
      t.userId,
      t.status,
      t.createdAt
    ),
  ]
);

export type SuggestedAction = typeof suggestedActions.$inferSelect;
export type NewSuggestedAction = typeof suggestedActions.$inferInsert;
export const insertSuggestedActionSchema = createInsertSchema(suggestedActions);
export const selectSuggestedActionSchema = createSelectSchema(suggestedActions);

// ---------------------------------------------------------------------------
// workflow_runs
// ---------------------------------------------------------------------------

/**
 * Durable workflow execution state, intentionally separate from `ingestionJobs`.
 * `ingestionJobStatusEnum` is immutable and only covers `pending/processing/succeeded/failed`;
 * workflows need `waiting_for_approval` to pause until a `suggested_actions` row
 * transitions to `approved`.
 *
 * `stepOutputs` is a JSON map of step name → output, enabling resume-from-step
 * after failure. `currentStep` names the in-flight or next-to-run step.
 */
export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Workflow type identifier, e.g. `execute_approved_action`.
     * Text (not enum) so new workflow kinds don't require a migration.
     */
    kind: text('kind').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    status: workflowRunStatusEnum('status').notNull().default('queued'),

    /** Name of the step currently executing or next to run on resume. */
    currentStep: text('current_step'),

    /** Map of completed step name → serialized output for resume-from-step. */
    stepOutputs: jsonb('step_outputs').notNull().default({}),

    error: text('error'),

    /** Earliest time this workflow should be picked up by the cron processor. */
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),

    /** When this run was claimed by the cron processor (lease start). */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),

    /**
     * Lease expiry for in-flight runs. Expired leases are reclaimed on the next
     * cron tick so lambda timeouts cannot orphan rows in `running` forever.
     */
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),

    /**
     * When the run reached `completed` and its output was published/sent
     * (opportunity lifecycle end). Set by the executor's completed transition.
     */
    shippedAt: timestamp('shipped_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index('workflow_runs_status_run_at_idx').on(t.status, t.runAt),
    uniqueIndex('workflow_runs_execute_approved_action_approval_uniq')
      .on(drizzleSql`${t.stepOutputs} ->> 'approvalId'`)
      .where(
        drizzleSql`${t.kind} = 'execute_approved_action' AND ${t.stepOutputs} ->> 'approvalId' IS NOT NULL`
      ),
  ]
);

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export const insertWorkflowRunSchema = createInsertSchema(workflowRuns);
export const selectWorkflowRunSchema = createSelectSchema(workflowRuns);

// ---------------------------------------------------------------------------
// workflow_run_outcomes
// ---------------------------------------------------------------------------

/**
 * Revenue outcome snapshot written when a workflow_run reaches `completed`.
 * One row per run — joins GMV, smartlink clicks, DSP clicks, and captured fans
 * inside the attribution window so automations can be rolled up to artist lift.
 */
export const workflowRunOutcomes = pgTable(
  'workflow_run_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Release or catalog asset tied to the automation, when known. */
    releaseId: text('release_id'),
    /** Originating suggested_action for connector automations. */
    suggestedActionId: uuid('suggested_action_id').references(
      () => suggestedActions.id,
      { onDelete: 'set null' }
    ),
    gmvDeltaCents: integer('gmv_delta_cents').notNull().default(0),
    clickDelta: integer('click_delta').notNull().default(0),
    dspClickDelta: integer('dsp_click_delta').notNull().default(0),
    newFansDelta: integer('new_fans_delta').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('workflow_run_outcomes_workflow_run_id_uniq').on(
      t.workflowRunId
    ),
    index('workflow_run_outcomes_user_id_window_end_idx').on(
      t.userId,
      t.windowEnd
    ),
  ]
);

export type WorkflowRunOutcome = typeof workflowRunOutcomes.$inferSelect;
export type NewWorkflowRunOutcome = typeof workflowRunOutcomes.$inferInsert;
export const insertWorkflowRunOutcomeSchema =
  createInsertSchema(workflowRunOutcomes);
export const selectWorkflowRunOutcomeSchema =
  createSelectSchema(workflowRunOutcomes);

// ---------------------------------------------------------------------------
// workflow_step_results
// ---------------------------------------------------------------------------

/**
 * Workflow-level result log (#12145): one row per executed workflow step,
 * tying an agent task outcome to its cost and the opportunity it served.
 *
 * Powers: agent task success rate, % human override, throughput per agent,
 * cost per opportunity identified, time-to-resolution per workflow chain,
 * and hallucination correction rate (retried / total).
 *
 * `status` and `agent` are text (not enums) per the schema convention that
 * new kinds must not require a migration. Known statuses:
 * `success` | `failed` | `human_override` | `retried`.
 */
export const workflowStepResults = pgTable(
  'workflow_step_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    /** Step name within the workflow (matches `workflow_runs.current_step` vocabulary). */
    step: text('step').notNull(),
    /** Agent/executor identifier, e.g. `execute_approved_action`. */
    agent: text('agent').notNull(),
    status: text('status').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** LLM + execution cost in USD. Cross-checks against Agnost LLM-level cost. */
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    latencyMs: integer('latency_ms'),
    /** The suggested_action (opportunity) this step served, when known. */
    linkedOpportunityId: uuid('linked_opportunity_id').references(
      () => suggestedActions.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index('workflow_step_results_agent_created_idx').on(t.agent, t.createdAt),
    index('workflow_step_results_run_id_idx').on(t.runId),
  ]
);

export type WorkflowStepResult = typeof workflowStepResults.$inferSelect;
export type NewWorkflowStepResult = typeof workflowStepResults.$inferInsert;
export const insertWorkflowStepResultSchema =
  createInsertSchema(workflowStepResults);
export const selectWorkflowStepResultSchema =
  createSelectSchema(workflowStepResults);

// ---------------------------------------------------------------------------
// release_cycle_step_events
// ---------------------------------------------------------------------------

/**
 * Manual-vs-automated release-cycle step classification (#12144).
 * One row per (release, step) execution, tagged with how it was done:
 * `automation` (workflow_run did it) | `manual` (artist action, no linked run)
 * | `skipped`. Canonical step vocabulary lives in
 * `lib/analytics/release-cycle-classification.ts`.
 */
export const releaseCycleStepEvents = pgTable(
  'release_cycle_step_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Release/catalog asset id (text, matching `workflow_run_outcomes.release_id`). */
    releaseId: text('release_id').notNull(),
    /** Canonical release-cycle step key (see RELEASE_CYCLE_STEPS). */
    step: text('step').notNull(),
    /** `automation` | `manual` | `skipped`. Text (not enum) — no migration for new sources. */
    source: text('source').notNull(),
    /** The workflow_run that executed this step, when source = automation. */
    workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    index('release_cycle_step_events_user_release_idx').on(
      t.userId,
      t.releaseId
    ),
    uniqueIndex('release_cycle_step_events_release_step_uniq').on(
      t.releaseId,
      t.step
    ),
  ]
);

export type ReleaseCycleStepEvent = typeof releaseCycleStepEvents.$inferSelect;
export type NewReleaseCycleStepEvent =
  typeof releaseCycleStepEvents.$inferInsert;
export const insertReleaseCycleStepEventSchema = createInsertSchema(
  releaseCycleStepEvents
);
export const selectReleaseCycleStepEventSchema = createSelectSchema(
  releaseCycleStepEvents
);
