/**
 * Fixture: booking email that conflicts with an existing calendar event.
 * Ground truth: should suggest (conflict resolution is a product decision, not extractor's job).
 * The extractor should still suggest; the UI shows the conflict.
 */
export const fixture = {
  id: 'booking_conflicting',
  label: 'should_suggest' as const,
  email: {
    subject: 'Booking: Tresor Berlin – August 8, 2026',
    from: 'bookings@tresorberlin.com',
    date: '2026-07-01T11:00:00Z',
    body: `Hi Tim,

Tresor confirms your booking:

Date: Saturday, August 8 / Sunday, August 9, 2026
Set: 4:00 AM – 7:00 AM
Venue: Tresor, Köpenicker Str. 70, 10179 Berlin

Fee: €5,500

Safe travels,
Tresor Berlin`,
  },
  existingCalendarEvents: [
    {
      id: 'conflict-event',
      summary: 'Flight BER → NYC',
      start: { dateTime: '2026-08-09T06:00:00+02:00' },
      end: { dateTime: '2026-08-09T18:00:00-05:00' },
    },
  ],
  expectedEvent: {
    title: 'Tresor Berlin',
    startsAt: '2026-08-09T04:00:00',
    city: 'Berlin',
    country: 'DE',
  },
  note: 'Conflict with existing event — extractor suggests anyway; UI handles conflict display',
};
