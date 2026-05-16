/**
 * Fixture: private corporate event booking.
 * Ground truth: should suggest — confirmed private booking.
 */
export const fixture = {
  id: 'booking_private_event',
  label: 'should_suggest' as const,
  email: {
    subject: 'Artist Confirmation: Private Event – Miami, December 5 2026',
    from: 'events@luxuryeventsmiami.com',
    date: '2026-10-20T14:00:00Z',
    body: `Hi Tim,

Confirming your performance at a private luxury event:

Date: Saturday, December 5, 2026
Time: 10:00 PM – 2:00 AM
Location: Private residence, Miami Beach, FL (full address shared closer to date)
Fee: $25,000

Please keep this event confidential.

Best,
Luxury Events Miami`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Private Event Miami Beach',
    startsAt: '2026-12-06T03:00:00Z',
    city: 'Miami Beach',
    region: 'FL',
    country: 'US',
  },
};
