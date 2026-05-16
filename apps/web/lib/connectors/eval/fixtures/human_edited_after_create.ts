/**
 * Fixture: booking email for a date that exists on calendar but was manually edited.
 * Ground truth: should NOT suggest — the event is already on calendar (human-edited variant).
 */
export const fixture = {
  id: 'human_edited_after_create',
  label: 'should_not_suggest' as const,
  email: {
    subject: 'Booking Confirmation: Panorama Bar Berlin – October 10, 2026',
    from: 'bookings@berghain.de',
    date: '2026-09-01T09:00:00Z',
    body: `Hi Tim,

Confirming your Panorama Bar booking:

Date: Saturday, October 10 / Sunday, October 11, 2026
Time: 5:00 AM – 10:00 AM
Venue: Panorama Bar, Berghain, Am Wriezener Bahnhof, Berlin

Fee: €4,500

Berghain Booking`,
  },
  existingCalendarEvents: [
    {
      id: 'human-edited-event',
      summary: 'Panorama Bar Berlin (edited: added live recording)',
      start: { dateTime: '2026-10-11T05:00:00+02:00' },
      end: { dateTime: '2026-10-11T10:00:00+02:00' },
      description:
        'Live recording session confirmed. Tim edited this manually.',
    },
  ],
  expectedEvent: null,
  note: 'Human-edited calendar event exists — extractor must not duplicate it',
};
