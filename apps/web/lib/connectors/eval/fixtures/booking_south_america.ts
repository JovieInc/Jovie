/**
 * Fixture: South America show booking.
 * Ground truth: should suggest.
 */
export const fixture = {
  id: 'booking_south_america',
  label: 'should_suggest' as const,
  email: {
    subject: 'Confirmed Booking: Green Valley SC Brazil – April 18, 2026',
    from: 'booking@greenvalleysc.com.br',
    date: '2026-02-15T20:00:00Z',
    body: `Dear Tim,

We are thrilled to confirm your performance at Green Valley!

Date: Saturday, April 18, 2026
Set time: 3:30 AM – 6:00 AM
Venue: Green Valley Club, Rua Dep. Antônio Edu Vieira, 1340, Florianópolis, Brazil
Fee: R$35,000

We will send the full rider and logistics document by the end of the week.

Green Valley Bookings`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Green Valley Florianópolis',
    startsAt: '2026-04-18T03:30:00',
    city: 'Florianópolis',
    country: 'BR',
  },
};
