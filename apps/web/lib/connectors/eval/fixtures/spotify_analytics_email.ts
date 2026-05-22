/**
 * Fixture: Spotify for Artists analytics email.
 * Ground truth: should NOT suggest — analytics report, not a booking.
 */
export const fixture = {
  id: 'spotify_analytics_email',
  label: 'should_not_suggest' as const,
  email: {
    subject: 'Your Monthly Spotify Stats — April 2026',
    from: 'noreply@spotifyforartists.com',
    date: '2026-05-01T09:00:00Z',
    body: `Hi Tim,

Here's your Spotify summary for April 2026:

Monthly Listeners: 412,000 (+8%)
Streams: 2.1M
Saves: 45,000
Playlist Adds: 12,000

Top Track: "Cascade" — 380,000 streams

Keep making music!

Spotify for Artists Team`,
  },
  existingCalendarEvents: [],
  expectedEvent: null,
  note: 'Analytics email — no event to create',
};
