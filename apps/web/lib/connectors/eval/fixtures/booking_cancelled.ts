/**
 * Fixture: booking cancellation email.
 * Ground truth: should NOT suggest a new calendar event.
 * (Cancellations remove events, not add them — handled separately.)
 */
export const fixture = {
  id: 'booking_cancelled',
  label: 'should_not_suggest' as const,
  email: {
    subject:
      'CANCELLED: Your booking at Printworks London – September 12, 2026',
    from: 'bookings@printworkslondon.com',
    date: '2026-08-20T15:00:00Z',
    body: `Hi Tim,

Unfortunately we must cancel your booking at Printworks London due to a scheduling conflict on our end.

Cancelled date: Saturday, September 12, 2026

We apologize for the inconvenience and hope to reschedule soon.

Printworks Bookings`,
  },
  existingCalendarEvents: [],
  expectedEvent: null,
  note: 'Cancellation email — extractor must NOT suggest creating an event',
};
