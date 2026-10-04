/**
 * Data lifecycle registry (JOV-6056).
 *
 * Canonical inventory of sensitive/personal data classes in the primary
 * database. Every entry declares purpose, owner, retention, deletion
 * propagation, and export coverage. `tests/unit/privacy/data-classes.test.ts`
 * gates on this registry: any table that stores a PII-shaped column must be
 * listed here before it can land.
 *
 * Non-database copies (caches, logs, backups, vendors) are documented per
 * class in `vendors`/`notes`; the audit narrative lives in
 * `docs/data-lifecycle-audit-jov-6056.md`.
 */

export const DELETION_MECHANISMS = [
  /** Explicitly deleted/anonymized by POST /api/account/delete. */
  'account-delete-route',
  /** Removed by a foreign-key cascade when its parent row is deleted. */
  'fk-cascade',
  /** Deleted by the /api/cron/data-retention job after the retention window. */
  'retention-cron',
  /** Row carries an expiry column consumed by a cleanup job. */
  'expires-at',
  /** Copy held by a third-party vendor under its own deletion API/DPA. */
  'vendor',
  /** No automated deletion today — documented gap tracked in the audit doc. */
  'unmanaged',
] as const;

export type DeletionMechanism = (typeof DELETION_MECHANISMS)[number];

export const EXPORT_CHANNELS = [
  /** Included in GET /api/account/export. */
  'account-export',
  /** Available via admin/CSV export only. */
  'admin-export',
  /** Not exported anywhere today. */
  'none',
] as const;

export type ExportChannel = (typeof EXPORT_CHANNELS)[number];

export const DATA_CLASSIFICATIONS = [
  'personal-data',
  'credentials',
  'payment',
  'communications',
  'telemetry',
  'compliance',
] as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export interface DataClass {
  /** Stable kebab-case identifier. */
  id: string;
  title: string;
  /** Why this data exists. */
  purpose: string;
  /** Owning surface, e.g. 'app/account', 'ops/email', 'ops/finance'. */
  owner: string;
  classification: DataClassification;
  /** Physical pg table names that hold this class of data. */
  tables: string[];
  /** How long data is kept and by what mechanism, in words. */
  retention: string;
  /** How deletion propagates. */
  deletion: DeletionMechanism[];
  /** Where the data shows up in exports. */
  export: ExportChannel[];
  /** Third-party vendors that receive a copy (Stripe, Clerk, Resend, …). */
  vendors?: string[];
  notes?: string;
}

/**
 * The registry. Adding a sensitive store means adding or extending an entry
 * here — the coverage test fails on any unregistered PII-bearing table.
 */
export const DATA_CLASSES: DataClass[] = [
  {
    id: 'account-identity',
    title: 'Account identity and sessions',
    purpose:
      'Identify the signed-in user, hold Better Auth identities/sessions, and ' +
      'issue OAuth tokens for Jovie-owned clients.',
    owner: 'app/auth',
    classification: 'personal-data',
    tables: [
      'users',
      'user_settings',
      'ba_users',
      'ba_accounts',
      'ba_sessions',
      'ba_verifications',
      'ba_oauth_clients',
      'ba_oauth_access_tokens',
      'ba_oauth_refresh_tokens',
      'ba_oauth_consents',
      'ba_oauth_resources',
      'ba_oauth_client_resources',
      'ba_oauth_client_assertions',
    ],
    retention:
      'For the life of the account. Sessions expire on their own expiry; ' +
      'OAuth tokens live until revoked or expired.',
    deletion: ['account-delete-route', 'fk-cascade', 'expires-at', 'vendor'],
    export: ['account-export'],
    vendors: ['Clerk (legacy auth)', 'Stripe (customer/subscription ids)'],
    notes:
      'users row is anonymized (name/email/Stripe ids nulled, status banned, ' +
      'deletedAt set) rather than hard-deleted; the row acts as the erasure fence.',
  },
  {
    id: 'creator-profile',
    title: 'Creator profiles and claims',
    purpose:
      'Public artist profile content, photos, ownership claims, invites, and ' +
      'distribution/claim audit records.',
    owner: 'app/profiles',
    classification: 'personal-data',
    tables: [
      'creator_profiles',
      'profile_photos',
      'profile_surfaces',
      'creator_avatar_candidates',
      'creator_profile_attributes',
      'user_profile_claims',
      'profile_ownership_log',
      'creator_distribution_events',
      'creator_claim_invites',
      'creator_brands',
    ],
    retention:
      'For the life of the profile; claim invites expire via token expiry.',
    deletion: ['account-delete-route', 'fk-cascade', 'expires-at'],
    export: ['account-export'],
    vendors: ['Vercel Blob (avatars/photos)'],
    notes:
      'Deleting creator_profiles cascades to photos/attributes/claims. Handle ' +
      'and profile caches are invalidated in the delete route.',
  },
  {
    id: 'creator-contacts',
    title: 'Creator business contacts',
    purpose:
      'Team/booking/management contacts a creator lists on their profile ' +
      '(names, emails, phones).',
    owner: 'app/profiles',
    classification: 'personal-data',
    tables: [
      'creator_contacts',
      'creator_contact_people',
      'creator_contact_responsibilities',
      'creator_contact_assignments',
    ],
    retention: 'For the life of the parent profile.',
    deletion: ['fk-cascade'],
    export: ['account-export'],
  },
  {
    id: 'social-links',
    title: 'Social links and suggestions',
    purpose:
      'Creator-managed outbound social/platform links and auto-generated ' +
      'suggestions.',
    owner: 'app/profiles',
    classification: 'personal-data',
    tables: ['social_links', 'social_link_suggestions'],
    retention: 'For the life of the parent profile.',
    deletion: ['fk-cascade'],
    export: ['account-export'],
  },
  {
    id: 'connected-accounts',
    title: 'Connected-account credentials',
    purpose:
      'OAuth/API tokens for DSPs, ad pixels, pre-saves, and shareable library ' +
      'links, plus Apple Wallet pass device registrations.',
    owner: 'app/integrations',
    classification: 'credentials',
    tables: [
      'connector_accounts',
      'connector_sync_states',
      'creator_pixels',
      'pre_save_tokens',
      'library_asset_share_settings',
      'library_share_drops',
      'apple_wallet_pass_devices',
      'apple_wallet_pass_registrations',
      'apple_wallet_profile_passes',
    ],
    retention:
      'While the connection/pass is active; revoked tokens persist as tombstones.',
    deletion: ['account-delete-route', 'fk-cascade', 'vendor'],
    export: ['none'],
    vendors: ['Apple (wallet passes)', 'Meta/Google/TikTok (pixel tokens)'],
    notes:
      'pre_save_tokens are explicitly deleted by the account-delete route. ' +
      'Vendor-held copies (issued OAuth grants) revoke via the provider.',
  },
  {
    id: 'audience-members',
    title: 'Audience/fan records',
    purpose:
      'Fans and anonymous visitors a creator collects: identifiers, contact ' +
      'points, blocks, actions, and referrers.',
    owner: 'app/audience',
    classification: 'personal-data',
    tables: [
      'audience_members',
      'audience_blocks',
      'audience_actions',
      'audience_referrers',
      'audience_source_groups',
      'audience_source_links',
      'public_profile_capture_dismissals',
      'category_subscriptions',
      'tip_audience',
    ],
    retention:
      'Anonymous audience members with no email/phone are deleted after the ' +
      'analytics retention window (default 90d); identified fans persist while ' +
      'the creator account exists.',
    deletion: ['retention-cron', 'fk-cascade'],
    export: ['admin-export'],
    vendors: [],
    notes:
      'Fan-facing deletion/export of audience rows is a documented gap — see ' +
      'the audit doc.',
  },
  {
    id: 'notification-consent',
    title: 'Notification subscriptions and consent',
    purpose:
      'Fan opt-ins for releases/notifications (email, phone, OTP state) and ' +
      'recipient channel preferences, including encrypted iOS push registrations.',
    owner: 'app/notifications',
    classification: 'personal-data',
    tables: [
      'notification_subscriptions',
      'notification_contacts',
      'sms_subscribe_intents',
      'recipient_preferences',
      'ios_push_devices',
    ],
    retention:
      'notification_subscriptions rows are deleted after the analytics ' +
      'retention window; SMS intents are cleaned by the sms-intents cron; ' +
      'iOS registrations are removed on sign-out, account deletion, or invalid-token response.',
    deletion: [
      'account-delete-route',
      'fk-cascade',
      'retention-cron',
      'vendor',
    ],
    export: ['none'],
    vendors: [
      'Apple Push Notification service',
      'Twilio (sms delivery)',
      'Resend (email delivery)',
    ],
  },
  {
    id: 'tips',
    title: 'Tips and tipper identity',
    purpose: 'Tip intents and tipper contact details collected at checkout.',
    owner: 'app/monetization',
    classification: 'payment',
    tables: ['tips'],
    retention:
      'Financial records retained for the life of the account plus legal ' +
      'hold; not covered by the analytics retention cron.',
    deletion: ['fk-cascade', 'vendor'],
    export: ['none'],
    vendors: ['Stripe'],
    notes: 'Not in account export today — flagged as an export gap.',
  },
  {
    id: 'merch-orders',
    title: 'Merch orders',
    purpose:
      'Buyer identity and shipping address for merch orders, plus generation ' +
      'batch provenance.',
    owner: 'app/merch',
    classification: 'payment',
    tables: [
      'merch_orders',
      'merch_cards',
      'merch_generation_batches',
      'merch_design_options',
    ],
    retention: 'Retained for fulfillment, tax, and dispute windows.',
    deletion: ['fk-cascade', 'vendor'],
    export: ['none'],
    vendors: ['Printful (fulfillment)', 'Stripe (payment)'],
  },
  {
    id: 'profile-inquiries',
    title: 'Profile inquiries and visitor intents',
    purpose:
      'Visitor messages, unanswered questions, and follow intents (with ' +
      'optional name/email/city) captured by the public Ask Jovie surface.',
    owner: 'app/profiles',
    classification: 'communications',
    tables: ['profile_inquiries'],
    retention: 'For the life of the parent profile; no automated retention.',
    deletion: ['fk-cascade', 'unmanaged'],
    export: ['none'],
    notes:
      'Visitor rows are not covered by account-export — documented gap, same class as audience members.',
  },
  {
    id: 'chat',
    title: 'Chat conversations',
    purpose:
      'Dashboard chat turns/messages between the user and Jovie, with an ' +
      'audit log for tool calls.',
    owner: 'app/chat',
    classification: 'communications',
    tables: [
      'chat_conversations',
      'chat_turns',
      'chat_messages',
      'chat_audit_log',
    ],
    retention: '1 year via data-retention cron.',
    deletion: ['retention-cron', 'fk-cascade'],
    export: ['none'],
    notes: 'Not in account export — flagged as an export gap.',
  },
  {
    id: 'inbox-email',
    title: 'Inbox email threads',
    purpose:
      'Inbound emails to creator-facing addresses, threading state, and ' +
      'outbound replies.',
    owner: 'app/inbox',
    classification: 'communications',
    tables: ['inbound_emails', 'email_threads', 'outbound_replies'],
    retention: 'No automated retention today.',
    deletion: ['fk-cascade', 'unmanaged'],
    export: ['none'],
    vendors: ['Resend (inbound/outbound transport)'],
    notes: 'Retention gap — see audit doc.',
  },
  {
    id: 'email-governance',
    title: 'Email governance and deliverability',
    purpose:
      'Suppression lists, unsubscribe tokens, delivery logs, engagement ' +
      'events, send attribution, and sender quotas/reputation.',
    owner: 'ops/email',
    classification: 'compliance',
    tables: [
      'email_suppressions',
      'unsubscribe_tokens',
      'email_engagement',
      'email_send_attribution',
      'notification_delivery_log',
      'webhook_events',
      'creator_email_quotas',
      'creator_sending_reputation',
    ],
    retention:
      'Suppressions persist until expiry (CAN-SPAM/GDPR suppression duty); ' +
      'tokens and engagement rows are removed on expiry or after the ' +
      'retention window.',
    deletion: ['retention-cron', 'expires-at', 'account-delete-route'],
    export: ['none'],
    vendors: ['Resend'],
    notes:
      'Suppressions authored by a deleted user are removed in the delete ' +
      'route; recipient-initiated suppressions must persist.',
  },
  {
    id: 'analytics-events',
    title: 'Product analytics and tracking events',
    purpose:
      'Click/pixel/server analytics events, profile views, promo downloads, ' +
      'signed-link access, and AI crawler snapshots.',
    owner: 'app/analytics',
    classification: 'telemetry',
    tables: [
      'click_events',
      'server_analytics_events',
      'pixel_events',
      'daily_profile_views',
      'profile_search_queries',
      'profile_search_runs',
      'profile_search_results',
      'profile_surface_issues',
      'promo_download_events',
      'promo_downloads',
      'signed_link_access',
      'ai_crawler_analytics_snapshots',
    ],
    retention:
      'Event tables delete after the analytics retention window (default ' +
      '90d) via data-retention cron; pixel IPs are additionally purged by the ' +
      'purge-pixel-ips cron.',
    deletion: ['retention-cron', 'fk-cascade'],
    export: ['admin-export'],
    vendors: ['Meta/Google/TikTok (forwarded pixel events)'],
  },
  {
    id: 'unclaimed-jovie-links',
    title: 'Unclaimed public Jovie links',
    purpose:
      'Create public listening pages while enforcing a monthly anonymous limit with a one-way subject hash. The raw IP address is not stored.',
    owner: 'app/links',
    classification: 'telemetry',
    tables: ['smart_links'],
    retention: 'Kept with the public link page until the row is deleted.',
    deletion: ['unmanaged'],
    export: ['none'],
    notes:
      'created_by_user_id is optional and does not prove artist ownership. Opening claimUrl does not create an account.',
  },
  {
    id: 'audit-logs',
    title: 'Security and admin audit logs',
    purpose: 'Admin action and ingestion audit trails including actor IPs.',
    owner: 'ops/security',
    classification: 'compliance',
    tables: ['admin_audit_log', 'ingest_audit_logs', 'admin_system_settings'],
    retention: '90 days via data-retention cron (admin_audit_log).',
    deletion: ['retention-cron'],
    export: ['admin-export'],
    notes:
      'admin_system_settings stores operator config including a bound Spotify ' +
      'clerk user id — treat as personal-linked config.',
  },
  {
    id: 'leads-waitlist',
    title: 'Leads, waitlist, and growth intake',
    purpose:
      'Prospect emails/names from marketing surfaces: waitlist, invites, ' +
      'lead capture, funnel events, and product-update subscribers.',
    owner: 'ops/growth',
    classification: 'personal-data',
    tables: [
      'leads',
      'waitlist_entries',
      'waitlist_invites',
      'lead_funnel_events',
      'lead_search_results',
      'discovery_keywords',
      'lead_pipeline_settings',
      'product_update_subscribers',
    ],
    retention:
      'No automated retention; invite/claim tokens expire via expiry columns. ' +
      'users.waitlist_entry_id is severed on account deletion.',
    deletion: ['expires-at', 'account-delete-route', 'unmanaged'],
    export: ['admin-export'],
    vendors: ['Resend'],
    notes: 'Lead/waitlist row retention is a documented gap — see audit doc.',
  },
  {
    id: 'canonical-contacts',
    title: 'Canonical customer contacts',
    purpose:
      'Canonical prospect/customer identity for the admin lifecycle surface: ' +
      'one deduped row per person across waitlist, lead, creator-profile, and ' +
      'user sources, plus its stage-transition history.',
    owner: 'ops/growth',
    classification: 'personal-data',
    tables: ['contacts', 'contact_stage_transitions'],
    retention:
      'For the life of the underlying source record; no dedicated retention ' +
      'job today.',
    deletion: ['fk-cascade', 'unmanaged'],
    export: ['admin-export'],
    notes:
      'contact_stage_transitions cascades on contact delete; source links use ' +
      'set-null so deleting a user/lead/profile severs the link but keeps the ' +
      'contact row. Erasure propagation into contacts is a documented gap.',
  },
  {
    id: 'finance',
    title: 'Connected finance data',
    purpose:
      'Institutions, accounts, transactions, and exports for the owner-only ' +
      'finance surface.',
    owner: 'ops/finance',
    classification: 'payment',
    tables: [
      'finance_institutions',
      'finance_accounts',
      'finance_transactions',
      'finance_exports',
    ],
    retention:
      'Retained while the finance connection is active; lifecycle slice is ' +
      'owned by JOV-4613 (disconnect/export/deletion).',
    deletion: ['fk-cascade', 'vendor'],
    export: ['admin-export'],
    vendors: ['Plaid (account aggregation)'],
    notes:
      'Owner-only privacy boundary per docs/security/FINANCE_PRIVACY_BOUNDARY.md; ' +
      'do not duplicate the JOV-4613 lifecycle work.',
  },
  {
    id: 'memory-graph',
    title: 'Memory/entity graph',
    purpose:
      'Derived entity graph, observations, edges, and events built from ' +
      'ingested sources for Jovie memory.',
    owner: 'app/memory',
    classification: 'personal-data',
    tables: [
      'memory_source_records',
      'memory_assets',
      'memory_entities',
      'memory_entity_identities',
      'memory_entity_aliases',
      'memory_observations',
      'memory_entity_edges',
      'memory_asset_entity_mentions',
      'memory_events',
      'memory_event_participants',
      'memory_enrichment_jobs',
      'memory_opportunities',
    ],
    retention: 'No automated retention today.',
    deletion: ['unmanaged'],
    export: ['none'],
    notes:
      'Derived copies of source data — deletion of a source does not ' +
      'currently propagate into the graph. Documented gap; customer↔Summer ' +
      'isolation is JOV-4320.',
  },
  {
    id: 'billing-payments',
    title: 'Billing and payment records',
    purpose:
      'Stripe webhook event receipts and the billing audit trail for ' +
      'entitlement changes.',
    owner: 'app/billing',
    classification: 'payment',
    tables: ['stripe_webhook_events', 'billing_audit_log'],
    retention:
      'Processed webhook events and audit rows delete after the retention ' +
      'window via data-retention cron.',
    deletion: ['retention-cron', 'vendor'],
    export: ['admin-export'],
    vendors: ['Stripe'],
  },
  {
    id: 'investor-relations',
    title: 'Investor and fundraising records',
    purpose:
      'Investor contacts, update drafts/candidates/approvals, delivery ' +
      'events, and stakeholder records for the fundraising surface.',
    owner: 'ops/finance',
    classification: 'personal-data',
    tables: [
      'investor_links',
      'investor_views',
      'investor_settings',
      'investor_update_drafts',
      'investor_update_candidates',
      'investor_update_candidate_decisions',
      'investor_update_final_approvals',
      'investor_update_delivery_events',
      'investor_stakeholder_records',
    ],
    retention: 'No automated retention; link tokens expire via expiry columns.',
    deletion: ['expires-at', 'unmanaged'],
    export: ['admin-export'],
    vendors: ['Resend'],
  },
  {
    id: 'feedback-interviews',
    title: 'Feedback and user interviews',
    purpose:
      'In-app feedback items (including founder-review recordings) and ' +
      'interview transcripts/summaries.',
    owner: 'app/feedback',
    classification: 'communications',
    tables: ['feedback_items', 'user_interviews'],
    retention: 'For the life of the account.',
    deletion: ['account-delete-route', 'fk-cascade'],
    export: ['none'],
    vendors: ['Vercel Blob (recordings)'],
    notes:
      'Founder-review blobs are deleted from Vercel Blob by the delete route, ' +
      'including a post-delete sweep for racing upload callbacks.',
  },
  {
    id: 'metadata-submissions',
    title: 'Metadata submissions',
    purpose:
      'Distributor metadata submission requests, artifacts, targets, ' +
      'snapshots, and issues — keyed to a reply-to email.',
    owner: 'app/metadata',
    classification: 'personal-data',
    tables: [
      'metadata_submission_requests',
      'metadata_submission_artifacts',
      'metadata_submission_targets',
      'metadata_submission_snapshots',
      'metadata_submission_issues',
    ],
    retention:
      'Processed by the metadata-submissions cron; no row retention job.',
    deletion: ['fk-cascade', 'unmanaged'],
    export: ['none'],
  },
];

const registeredTables = new Set(DATA_CLASSES.flatMap(c => c.tables));

/** Tables registered as holding sensitive/customer data. */
export function getRegisteredTables(): ReadonlySet<string> {
  return registeredTables;
}
