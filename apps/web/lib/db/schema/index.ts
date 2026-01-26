/**
 * Database Schema - Modular Exports
 *
 * This file re-exports all schema definitions from domain-focused modules.
 * Import from here for backwards compatibility with existing code.
 *
 * @example
 * import { users, creatorProfiles, socialLinks } from '@/lib/db/schema';
 */

// Admin
export * from './admin';
// Analytics (Clicks, Audience, Tips)
export * from './analytics';
// Auth & Users
export * from './auth';
// Billing (Stripe, Audit)
export * from './billing';
// Content (Providers, Releases, Tracks)
export * from './content';
// DSP Enrichment (Cross-platform matches, enrichment data)
export * from './dsp-enrichment';
// Enums
export * from './enums';
// Ingestion
export * from './ingestion';
// Links (Social, Wrapped, Signed)
export * from './links';
// Creator Profiles
export * from './profiles';
// Suppression (Email Suppressions, Webhook Events, Delivery Logs)
export * from './suppression';
// Tour (Tour Dates)
export * from './tour';

// Waitlist
export * from './waitlist';
