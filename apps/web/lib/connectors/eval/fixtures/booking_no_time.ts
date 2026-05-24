/**
 * Fixture: booking email with date but no specific time.
 * Ground truth: should suggest — date is known even if time is TBD.
 */
export const fixture = {
  id: 'booking_no_time',
  label: 'should_suggest' as const,
  email: {
    subject: 'Booking Hold: Movement Detroit – Memorial Day Weekend 2026',
    from: 'artists@movement.us',
    date: '2026-02-01T12:00:00Z',
    body: `Hi Tim,

We're holding a slot for you at Movement Detroit 2026.

Date: Memorial Day Weekend — May 23–25, 2026
Venue: Hart Plaza, Detroit, MI
Set time: TBD — we'll confirm your exact slot 6 weeks out

This is a confirmed booking, not a hold.

Movement Detroit`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Movement Detroit',
    startsAt: '2026-05-23',
    city: 'Detroit',
    region: 'MI',
    country: 'US',
  },
  note: 'Date known, time TBD — extractor should suggest with all-day or noon anchor',
};
