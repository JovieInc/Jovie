/**
 * Fixture: festival stage booking.
 * Ground truth: should suggest — festival slot is a confirmed booking.
 */
export const fixture = {
  id: 'booking_festival_stage',
  label: 'should_suggest' as const,
  email: {
    subject: 'Sonar Barcelona 2026 — Artist Confirmation',
    from: 'artists@sonar.es',
    date: '2026-03-20T10:00:00Z',
    body: `Dear Tim White,

We are delighted to confirm your performance at Sónar 2026.

Date: Friday, June 19, 2026
Stage: SónarClub
Set time: 2:00 AM – 4:00 AM
Festival: Sónar Barcelona, Av. de la Reina Maria Cristina, 08004 Barcelona

Artist fee: €12,000

Full technical rider and hotel details will be sent separately.

Best regards,
Sónar Artist Relations`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Sónar Barcelona',
    startsAt: '2026-06-20T02:00:00',
    city: 'Barcelona',
    country: 'ES',
  },
};
