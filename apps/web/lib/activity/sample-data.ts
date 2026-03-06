import type { ActivityEvent } from './types';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export const SAMPLE_PROFILE_EVENTS: ActivityEvent[] = [
  {
    id: 'evt-1',
    entityType: 'profile',
    entityId: 'profile-1',
    action: 'updated',
    description: 'Display name changed to "DJ Nova"',
    createdAt: hoursAgo(1),
    actor: { type: 'user', name: 'You' },
  },
  {
    id: 'evt-2',
    entityType: 'profile',
    entityId: 'profile-1',
    action: 'linked',
    description: 'Instagram link added',
    createdAt: hoursAgo(3),
    actor: { type: 'user', name: 'You' },
  },
  {
    id: 'evt-3',
    entityType: 'profile',
    entityId: 'profile-1',
    action: 'verified',
    description: 'Spotify artist profile verified',
    createdAt: daysAgo(1),
    actor: { type: 'system', name: 'Jovie' },
  },
  {
    id: 'evt-4',
    entityType: 'profile',
    entityId: 'profile-1',
    action: 'enriched',
    description: 'Apple Music profile discovered',
    createdAt: daysAgo(2),
    actor: { type: 'system', name: 'Jovie' },
  },
  {
    id: 'evt-5',
    entityType: 'profile',
    entityId: 'profile-1',
    action: 'created',
    description: 'Profile created',
    createdAt: daysAgo(7),
    actor: { type: 'user', name: 'You' },
  },
];

export const SAMPLE_RELEASE_EVENTS: ActivityEvent[] = [
  {
    id: 'evt-r1',
    entityType: 'release',
    entityId: 'release-1',
    action: 'enriched',
    description: 'Jovie found Apple Music link for this release',
    createdAt: hoursAgo(2),
    actor: { type: 'system', name: 'Jovie' },
  },
  {
    id: 'evt-r2',
    entityType: 'release',
    entityId: 'release-1',
    action: 'linked',
    description: 'Spotify link added manually',
    createdAt: hoursAgo(5),
    actor: { type: 'user', name: 'You' },
  },
  {
    id: 'evt-r3',
    entityType: 'release',
    entityId: 'release-1',
    action: 'updated',
    description: 'Artwork updated',
    createdAt: daysAgo(1),
    actor: { type: 'user', name: 'You' },
  },
  {
    id: 'evt-r4',
    entityType: 'release',
    entityId: 'release-1',
    action: 'synced',
    description: 'Release metadata synced from Spotify',
    createdAt: daysAgo(3),
    actor: { type: 'system', name: 'Jovie' },
  },
  {
    id: 'evt-r5',
    entityType: 'release',
    entityId: 'release-1',
    action: 'imported',
    description: 'Release imported from Spotify catalog',
    createdAt: daysAgo(5),
    actor: { type: 'system', name: 'Jovie' },
  },
];

export const SAMPLE_AUDIENCE_EVENTS: ActivityEvent[] = [
  {
    id: 'evt-a1',
    entityType: 'audience_member',
    entityId: 'audience-1',
    action: 'created',
    description: 'Subscribed via profile page',
    createdAt: hoursAgo(4),
    actor: { type: 'system', name: 'Jovie' },
  },
  {
    id: 'evt-a2',
    entityType: 'audience_member',
    entityId: 'audience-1',
    action: 'enriched',
    description: 'Email verified',
    createdAt: daysAgo(1),
    actor: { type: 'system', name: 'Jovie' },
  },
];
