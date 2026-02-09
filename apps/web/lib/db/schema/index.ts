/**
 * Database Schema - Modular Exports
 *
 * This file re-exports all schema definitions from domain-focused modules.
 * Import from here for backwards compatibility with existing code.
 *
 * @example
 * import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
 */

// Admin
export * from './admin';
// Analytics (Clicks, Audience, Tips)
export * from './analytics';
// Auth & Users
export * from './auth';
// Billing (Stripe, Audit)
export * from './billing';
// Chat (Conversations, Messages, Audit)
export * from './chat';
// Content (Providers, Releases, Tracks)
export * from './content';
// DSP Bio Sync (Bio update pushes to DSPs)
export * from './dsp-bio-sync';
// DSP Enrichment (Cross-platform matches, enrichment data)
export * from './dsp-enrichment';
// Email Engagement (Opens, Clicks, Drip Campaigns)
export * from './email-engagement';
// Enums
export * from './enums';
// AI Insights (AI-generated analytics insights)
export * from './insights';
// Ingestion
export * from './ingestion';
// Links (Social, Wrapped, Signed)
export * from './links';
// Pixel Tracking (Events, Creator Configs)
export * from './pixels';
// Creator Profiles
export * from './profiles';
// Sender (Email Quotas, Sending Reputation, Send Attribution)
export * from './sender';
// Suppression (Email Suppressions, Webhook Events, Delivery Logs)
export * from './suppression';
// Tour (Tour Dates)
export * from './tour';

// Waitlist
export * from './waitlist';
