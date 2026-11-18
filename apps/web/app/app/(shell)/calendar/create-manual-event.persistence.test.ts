// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, it, vi } from 'vitest';
import { tourDates } from '@/lib/db/schema/tour';
import { insertEvent } from '@/lib/events/insert';
import { aggregateTourData } from '@/lib/services/insights/tour-data';
import {
  getConfirmedTourEventsForProfile,
  getUpcomingTourDatesForProfile,
} from '@/lib/tour-dates/queries';
import { createManualEvent } from './create-manual-event';

const fixture = vi.hoisted(() => ({
  profileId: '9a3a4b55-0000-4000-8000-000000000001',
  db: null as ReturnType<typeof drizzle> | null,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: 'test-user' }),
}));
vi.mock('../dashboard/actions', () => ({
  getDashboardDataEssential: async () => ({
    selectedProfile: { id: fixture.profileId },
    needsOnboarding: false,
    dashboardLoadError: false,
  }),
}));
vi.mock('@/lib/db', () => ({
  get db() {
    if (!fixture.db) throw new Error('Local test database is not initialized');
    return fixture.db;
  },
}));

it('persists a confirmed signing privately while confirmed tours reach both public feeds', async () => {
  const client = new PGlite();
  try {
    // Use the authoritative initial schema and the event trust-gate migration.
    for (const filename of [
      '0000_v1_initial_schema.sql',
      '0042_calendar_events_trust_gate.sql',
    ]) {
      await client.exec(
        await readFile(`drizzle/migrations/${filename}`, 'utf8')
      );
    }

    await client.query(
      `INSERT INTO creator_profiles (id, creator_type, username, username_normalized)
       VALUES ($1, 'artist', 'event-owner', 'event-owner')`,
      [fixture.profileId]
    );
    fixture.db = drizzle(client);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));

    expect(
      await createManualEvent(fixture.profileId, {
        eventType: 'signing',
        title: 'Book launch signing',
        venueName: 'City Books',
        city: 'Los Angeles',
        region: 'CA',
        country: 'US',
        localStart: '2026-11-20T20:00',
        timezone: 'America/Los_Angeles',
        ticketUrl: '',
      })
    ).toEqual({ ok: true });

    const [signing] = await fixture.db.select().from(tourDates);
    expect(signing).toMatchObject({
      profileId: fixture.profileId,
      eventType: 'signing',
      provider: 'manual',
      confirmationStatus: 'confirmed',
      reviewedAt: new Date('2026-11-18T12:00:00.000Z'),
      startDate: new Date('2026-11-21T04:00:00.000Z'),
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      ticketUrl: null,
    });

    const tour = await insertEvent({
      profileId: fixture.profileId,
      eventType: 'tour',
      provider: 'manual',
      startDate: new Date('2026-11-22T04:00:00.000Z'),
      venueName: 'The Hall',
      city: 'Los Angeles',
      country: 'US',
    });
    expect(
      (await getUpcomingTourDatesForProfile(fixture.profileId)).map(
        event => event.id
      )
    ).toEqual([tour.id]);
    expect(
      (await getConfirmedTourEventsForProfile(fixture.profileId)).map(
        event => event.id
      )
    ).toEqual([tour.id]);
    expect((await aggregateTourData(fixture.profileId)).upcomingShows).toEqual([
      {
        city: 'Los Angeles',
        country: 'US',
        date: '2026-11-22T04:00:00.000Z',
        venueName: 'The Hall',
      },
    ]);
  } finally {
    vi.useRealTimers();
    fixture.db = null;
    await client.close();
  }
}, 30_000);
