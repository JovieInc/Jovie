/**
 * Fixture: booking email for a show NOT on the calendar.
 * Ground truth: should suggest — new event needs to be added.
 */
export const fixture = {
  id: 'booking_missing',
  label: 'should_suggest' as const,
  email: {
    subject: 'Show Confirmation: DC10 Ibiza – July 19, 2026',
    from: 'bookings@dc-10.com',
    date: '2026-06-01T09:00:00Z',
    body: `Dear Tim,

Your booking at DC10 is confirmed.

Date: Sunday, July 19, 2026
Set time: 3:00 AM – 6:00 AM
Venue: DC10 Ibiza, Carretera de l'Aeroport km 0.2, 07820 Ibiza

Fee: €8,500

Looking forward to having you back!

DC10 Bookings`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'DC10 Ibiza',
    startsAt: '2026-07-19T03:00:00',
    city: 'Ibiza',
    country: 'ES',
  },
};
