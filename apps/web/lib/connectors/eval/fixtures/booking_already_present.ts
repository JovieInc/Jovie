/**
 * Fixture: booking for a date already on the calendar.
 * Ground truth: should NOT suggest (event already exists).
 */
export const fixture = {
  id: 'booking_already_present',
  label: 'should_not_suggest' as const,
  email: {
    subject: 'Booking Confirmation: Fabric London – June 14, 2026',
    from: 'bookings@fabriclondon.com',
    date: '2026-05-01T10:00:00Z',
    body: `Hi Tim,

Confirming your booking at fabric, London.

Date: Sunday, June 14, 2026
Time: 11:00 PM – 6:00 AM
Venue: fabric, 77a Charterhouse St, London EC1M 6HJ

Best,
fabric Bookings`,
  },
  existingCalendarEvents: [
    {
      id: 'existing-event-1',
      summary: 'fabric London',
      start: { dateTime: '2026-06-14T23:00:00+01:00' },
      end: { dateTime: '2026-06-15T06:00:00+01:00' },
    },
  ],
  expectedEvent: null,
  note: 'Event already on calendar — extractor must not duplicate it',
};
