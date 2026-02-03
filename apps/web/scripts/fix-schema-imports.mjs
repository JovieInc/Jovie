#!/usr/bin/env node

/**
 * Fix schema barrel imports by mapping them to specific schema files.
 * Usage: node scripts/fix-schema-imports.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

// Mapping of exports to their schema files
const SCHEMA_MAPPING = {
  // admin.ts
  adminAuditLog: 'admin',
  insertAdminAuditLogSchema: 'admin',
  selectAdminAuditLogSchema: 'admin',
  AdminAuditLog: 'admin',
  NewAdminAuditLog: 'admin',

  // analytics.ts
  audienceMembers: 'analytics',
  clickEvents: 'analytics',
  FanNotificationPreferences: 'analytics',
  notificationSubscriptions: 'analytics',
  tips: 'analytics',
  insertClickEventSchema: 'analytics',
  selectClickEventSchema: 'analytics',
  insertNotificationSubscriptionSchema: 'analytics',
  selectNotificationSubscriptionSchema: 'analytics',
  insertTipSchema: 'analytics',
  selectTipSchema: 'analytics',
  ClickEvent: 'analytics',
  NewClickEvent: 'analytics',
  NotificationSubscription: 'analytics',
  NewNotificationSubscription: 'analytics',
  Tip: 'analytics',
  NewTip: 'analytics',
  AudienceMember: 'analytics',
  NewAudienceMember: 'analytics',
  insertAudienceMemberSchema: 'analytics',
  selectAudienceMemberSchema: 'analytics',

  // auth.ts
  users: 'auth',
  userSettings: 'auth',
  insertUserSchema: 'auth',
  selectUserSchema: 'auth',
  User: 'auth',
  NewUser: 'auth',
  UserSettings: 'auth',
  NewUserSettings: 'auth',

  // billing.ts
  stripeWebhookEvents: 'billing',
  billingAuditLog: 'billing',
  insertStripeWebhookEventSchema: 'billing',
  selectStripeWebhookEventSchema: 'billing',
  insertBillingAuditLogSchema: 'billing',
  selectBillingAuditLogSchema: 'billing',
  StripeWebhookEvent: 'billing',
  NewStripeWebhookEvent: 'billing',
  BillingAuditLog: 'billing',
  NewBillingAuditLog: 'billing',

  // content.ts
  providers: 'content',
  discogReleases: 'content',
  discogTracks: 'content',
  providerLinks: 'content',
  smartLinkTargets: 'content',
  contentSlugRedirects: 'content',
  artists: 'content',
  trackArtists: 'content',
  releaseArtists: 'content',
  insertProviderSchema: 'content',
  selectProviderSchema: 'content',
  Provider: 'content',
  NewProvider: 'content',
  DiscogRelease: 'content',
  NewDiscogRelease: 'content',
  DiscogTrack: 'content',
  NewDiscogTrack: 'content',
  ProviderLink: 'content',
  NewProviderLink: 'content',
  SmartLinkTarget: 'content',
  NewSmartLinkTarget: 'content',
  ContentSlugRedirect: 'content',
  NewContentSlugRedirect: 'content',
  Artist: 'content',
  NewArtist: 'content',
  TrackArtist: 'content',
  NewTrackArtist: 'content',
  ReleaseArtist: 'content',
  NewReleaseArtist: 'content',
  insertDiscogReleaseSchema: 'content',
  selectDiscogReleaseSchema: 'content',
  insertDiscogTrackSchema: 'content',
  selectDiscogTrackSchema: 'content',
  insertProviderLinkSchema: 'content',
  selectProviderLinkSchema: 'content',
  insertSmartLinkTargetSchema: 'content',
  selectSmartLinkTargetSchema: 'content',
  insertArtistSchema: 'content',
  selectArtistSchema: 'content',

  // dsp-enrichment.ts
  DspMatchConfidenceBreakdown: 'dsp-enrichment',
  DspImageUrls: 'dsp-enrichment',
  DspExternalUrls: 'dsp-enrichment',
  SocialSuggestionConfidenceBreakdown: 'dsp-enrichment',
  dspArtistMatches: 'dsp-enrichment',
  dspArtistEnrichment: 'dsp-enrichment',
  releaseSyncStatus: 'dsp-enrichment',
  fanReleaseNotifications: 'dsp-enrichment',
  socialLinkSuggestions: 'dsp-enrichment',
  insertDspArtistMatchSchema: 'dsp-enrichment',
  selectDspArtistMatchSchema: 'dsp-enrichment',
  DspArtistMatch: 'dsp-enrichment',
  NewDspArtistMatch: 'dsp-enrichment',
  DspArtistEnrichment: 'dsp-enrichment',
  NewDspArtistEnrichment: 'dsp-enrichment',
  ReleaseSyncStatus: 'dsp-enrichment',
  NewReleaseSyncStatus: 'dsp-enrichment',
  FanReleaseNotification: 'dsp-enrichment',
  NewFanReleaseNotification: 'dsp-enrichment',
  SocialLinkSuggestion: 'dsp-enrichment',
  NewSocialLinkSuggestion: 'dsp-enrichment',

  // email-engagement.ts
  EmailEngagementEventType: 'email-engagement',
  TrackedEmailType: 'email-engagement',
  EmailEngagementMetadata: 'email-engagement',
  emailEngagement: 'email-engagement',
  campaignSequences: 'email-engagement',
  CampaignStep: 'email-engagement',
  CampaignStepCondition: 'email-engagement',
  campaignEnrollments: 'email-engagement',
  insertEmailEngagementSchema: 'email-engagement',
  selectEmailEngagementSchema: 'email-engagement',
  EmailEngagement: 'email-engagement',
  NewEmailEngagement: 'email-engagement',
  CampaignSequence: 'email-engagement',
  NewCampaignSequence: 'email-engagement',
  CampaignEnrollment: 'email-engagement',
  NewCampaignEnrollment: 'email-engagement',

  // enums.ts
  creatorTypeEnum: 'enums',
  themeModeEnum: 'enums',
  photoStatusEnum: 'enums',
  linkTypeEnum: 'enums',
  socialLinkStateEnum: 'enums',
  socialAccountStatusEnum: 'enums',
  providerKindEnum: 'enums',
  discogReleaseTypeEnum: 'enums',
  providerLinkOwnerEnum: 'enums',
  subscriptionPlanEnum: 'enums',

  // ingestion.ts
  ingestionJobs: 'ingestion',
  scraperConfigs: 'ingestion',
  insertIngestionJobSchema: 'ingestion',
  selectIngestionJobSchema: 'ingestion',
  insertScraperConfigSchema: 'ingestion',
  selectScraperConfigSchema: 'ingestion',
  IngestionJob: 'ingestion',
  NewIngestionJob: 'ingestion',
  ScraperConfig: 'ingestion',
  NewScraperConfig: 'ingestion',

  // links.ts
  socialLinks: 'links',
  socialAccounts: 'links',
  wrappedLinks: 'links',
  signedLinkAccess: 'links',
  dashboardIdempotencyKeys: 'links',
  insertSocialLinkSchema: 'links',
  selectSocialLinkSchema: 'links',
  insertSocialAccountSchema: 'links',
  selectSocialAccountSchema: 'links',
  insertWrappedLinkSchema: 'links',
  selectWrappedLinkSchema: 'links',
  SocialLink: 'links',
  NewSocialLink: 'links',
  SocialAccount: 'links',
  NewSocialAccount: 'links',
  WrappedLink: 'links',
  NewWrappedLink: 'links',
  SignedLinkAccess: 'links',
  NewSignedLinkAccess: 'links',
  DashboardIdempotencyKey: 'links',
  NewDashboardIdempotencyKey: 'links',

  // pixels.ts
  PixelForwardingStatus: 'pixels',
  PixelEventData: 'pixels',
  pixelEvents: 'pixels',
  creatorPixels: 'pixels',
  insertPixelEventSchema: 'pixels',
  selectPixelEventSchema: 'pixels',
  insertCreatorPixelSchema: 'pixels',
  selectCreatorPixelSchema: 'pixels',
  PixelEvent: 'pixels',
  NewPixelEvent: 'pixels',
  CreatorPixel: 'pixels',
  NewCreatorPixel: 'pixels',

  // profiles.ts
  NotificationPreferences: 'profiles',
  FitScoreBreakdown: 'profiles',
  creatorProfiles: 'profiles',
  creatorContacts: 'profiles',
  creatorAvatarCandidates: 'profiles',
  creatorProfileAttributes: 'profiles',
  profilePhotos: 'profiles',
  creatorClaimInvites: 'profiles',
  insertCreatorProfileSchema: 'profiles',
  selectCreatorProfileSchema: 'profiles',
  CreatorProfile: 'profiles',
  NewCreatorProfile: 'profiles',
  CreatorContact: 'profiles',
  NewCreatorContact: 'profiles',
  CreatorAvatarCandidate: 'profiles',
  NewCreatorAvatarCandidate: 'profiles',
  CreatorProfileAttribute: 'profiles',
  NewCreatorProfileAttribute: 'profiles',
  ProfilePhoto: 'profiles',
  NewProfilePhoto: 'profiles',
  CreatorClaimInvite: 'profiles',
  NewCreatorClaimInvite: 'profiles',
  insertCreatorContactSchema: 'profiles',
  selectCreatorContactSchema: 'profiles',

  // sender.ts
  QuotaMetadata: 'sender',
  creatorEmailQuotas: 'sender',
  ReputationMetadata: 'sender',
  creatorSendingReputation: 'sender',
  emailSendAttribution: 'sender',
  insertCreatorEmailQuotaSchema: 'sender',
  selectCreatorEmailQuotaSchema: 'sender',
  insertCreatorSendingReputationSchema: 'sender',
  selectCreatorSendingReputationSchema: 'sender',
  insertEmailSendAttributionSchema: 'sender',
  selectEmailSendAttributionSchema: 'sender',
  CreatorEmailQuota: 'sender',
  NewCreatorEmailQuota: 'sender',
  CreatorSendingReputation: 'sender',
  NewCreatorSendingReputation: 'sender',
  EmailSendAttribution: 'sender',
  NewEmailSendAttribution: 'sender',

  // suppression.ts
  SuppressionMetadata: 'suppression',
  emailSuppressions: 'suppression',
  webhookEvents: 'suppression',
  DeliveryLogMetadata: 'suppression',
  notificationDeliveryLog: 'suppression',
  categorySubscriptions: 'suppression',
  unsubscribeTokens: 'suppression',
  insertEmailSuppressionSchema: 'suppression',
  selectEmailSuppressionSchema: 'suppression',
  insertWebhookEventSchema: 'suppression',
  selectWebhookEventSchema: 'suppression',
  EmailSuppression: 'suppression',
  NewEmailSuppression: 'suppression',
  WebhookEvent: 'suppression',
  NewWebhookEvent: 'suppression',
  NotificationDeliveryLog: 'suppression',
  NewNotificationDeliveryLog: 'suppression',
  CategorySubscription: 'suppression',
  NewCategorySubscription: 'suppression',
  UnsubscribeToken: 'suppression',
  NewUnsubscribeToken: 'suppression',

  // tour.ts
  tourDateProviderEnum: 'tour',
  ticketStatusEnum: 'tour',
  tourDates: 'tour',
  insertTourDateSchema: 'tour',
  selectTourDateSchema: 'tour',
  TourDate: 'tour',
  NewTourDate: 'tour',

  // waitlist.ts
  waitlistEntries: 'waitlist',
  waitlistInvites: 'waitlist',
  insertWaitlistEntrySchema: 'waitlist',
  selectWaitlistEntrySchema: 'waitlist',
  insertWaitlistInviteSchema: 'waitlist',
  selectWaitlistInviteSchema: 'waitlist',
  WaitlistEntry: 'waitlist',
  NewWaitlistEntry: 'waitlist',
  WaitlistInvite: 'waitlist',
  NewWaitlistInvite: 'waitlist',
};

// Find all files with schema barrel imports
const findFiles = () => {
  const result = execSync(
    `grep -rl "from '@/lib/db/schema'" --include="*.ts" --include="*.tsx" .`,
    { encoding: 'utf-8', cwd: '/home/user/Jovie/apps/web' }
  );
  return result.trim().split('\n').filter(Boolean);
};

// Parse imports from a line like: import { users, creatorProfiles } from '@/lib/db/schema';
const parseImports = line => {
  const match = line.match(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/db\/schema['"]/
  );
  if (!match) return null;

  const imports = match[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      // Handle "import { foo as bar }"
      const aliasMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliasMatch) {
        return { name: aliasMatch[1], alias: aliasMatch[2] };
      }
      // Handle type imports like "type Foo"
      const typeMatch = s.match(/^type\s+(\w+)$/);
      if (typeMatch) {
        return { name: typeMatch[1], isType: true };
      }
      return { name: s };
    });

  return imports;
};

// Group imports by their schema file
const groupBySchemaFile = imports => {
  const groups = {};
  const unknown = [];

  for (const imp of imports) {
    const schemaFile = SCHEMA_MAPPING[imp.name];
    if (schemaFile) {
      if (!groups[schemaFile]) groups[schemaFile] = [];
      groups[schemaFile].push(imp);
    } else {
      unknown.push(imp.name);
    }
  }

  return { groups, unknown };
};

// Generate new import statements
const generateImports = groups => {
  const lines = [];

  for (const [schemaFile, imports] of Object.entries(groups).sort()) {
    const importParts = imports.map(imp => {
      if (imp.alias) return `${imp.name} as ${imp.alias}`;
      if (imp.isType) return `type ${imp.name}`;
      return imp.name;
    });

    lines.push(
      `import { ${importParts.join(', ')} } from '@/lib/db/schema/${schemaFile}';`
    );
  }

  return lines.join('\n');
};

// Process a single file
const processFile = filePath => {
  const fullPath = `/home/user/Jovie/apps/web/${filePath}`;
  let content = readFileSync(fullPath, 'utf-8');
  let modified = false;

  // Find all schema barrel imports
  const importRegex =
    /import\s*\{[^}]+\}\s*from\s*['"]@\/lib\/db\/schema['"];?/g;
  const matches = content.match(importRegex);

  if (!matches) return { modified: false };

  for (const match of matches) {
    const imports = parseImports(match);
    if (!imports) continue;

    const { groups, unknown } = groupBySchemaFile(imports);

    if (unknown.length > 0) {
      console.log(
        `  Warning: Unknown imports in ${filePath}: ${unknown.join(', ')}`
      );
    }

    if (Object.keys(groups).length === 0) continue;

    const newImports = generateImports(groups);
    content = content.replace(match, newImports);
    modified = true;
  }

  if (modified) {
    writeFileSync(fullPath, content);
    return { modified: true };
  }

  return { modified: false };
};

// Main
const main = () => {
  console.log('Finding files with @/lib/db/schema imports...');
  const files = findFiles();
  console.log(`Found ${files.length} files\n`);

  let modifiedCount = 0;

  for (const file of files) {
    const result = processFile(file);
    if (result.modified) {
      console.log(`✓ Fixed: ${file}`);
      modifiedCount++;
    }
  }

  console.log(`\nDone! Modified ${modifiedCount} files.`);
};

main();
