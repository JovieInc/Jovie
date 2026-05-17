/**
 * Fixture: tentative hold email, not yet confirmed.
 * Ground truth: should NOT suggest — holds are not confirmed bookings.
 */
export const fixture = {
  id: 'booking_tentative_hold',
  label: 'should_not_suggest' as const,
  email: {
    subject: 'HOLD REQUEST: Fabric London – October 31, 2026',
    from: 'bookings@fabriclondon.com',
    date: '2026-09-01T09:00:00Z',
    body: `Hi,

We'd like to place a tentative hold on Tim White for Halloween at fabric.

Date: Saturday, October 31 / Sunday, November 1, 2026
This is a HOLD REQUEST only — not confirmed.

Please let us know availability by September 15.

fabric Bookings`,
  },
  existingCalendarEvents: [],
  expectedEvent: null,
  note: 'Hold request — extractor must NOT suggest until confirmed',
};
