/**
 * Fixture: confirmed show booking email.
 * Ground truth: should suggest a calendar event.
 */
export const fixture = {
  id: 'booking_confirmed',
  label: 'should_suggest' as const,
  email: {
    subject: 'Booking Confirmation: Output Brooklyn – May 23, 2026',
    from: 'bookings@outputclub.com',
    date: '2026-04-10T14:00:00Z',
    body: `Hi Tim,

We're thrilled to confirm your booking at Output Brooklyn!

Date: Saturday, May 23, 2026
Time: 10:00 PM – 4:00 AM
Venue: Output Brooklyn, 74 Wythe Ave, Brooklyn, NY 11249
Fee: $4,000

Please arrive by 9:30 PM for soundcheck.

Best,
Output Bookings`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Output Brooklyn',
    startsAt: '2026-05-24T02:00:00Z',
    city: 'Brooklyn',
    region: 'NY',
    country: 'US',
  },
};
