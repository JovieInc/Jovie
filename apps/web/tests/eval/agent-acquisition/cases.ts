import type { ArtistIntentCase, ListenerCase } from './spec';

/**
 * Over-trigger cases for the ChatGPT artist-app listing (JOV-9688).
 *
 * Artist-intent prompts are buyer voice: a musician (or their team) asking
 * for the thing the acquisition tools build — an unpublished release page,
 * a smart link, a prepared launch. Name-only prompts stop at
 * artist.search_or_import because the assistant must confirm the exact
 * artist before drafting; prompts with a clear go-ahead or an exact link
 * drive the full chain.
 *
 * Listener prompts are consumer voice: play, listen, follow, tickets,
 * merch, updates. They must never create drafts.
 */

export const ARTIST_INTENT_CASES: readonly ArtistIntentCase[] = [
  {
    id: 'release-page-new-single',
    prompt: 'Make a release page for my new single.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'smart-link-upcoming-release',
    prompt: 'Set up a smart link for my upcoming release.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'landing-page-next-drop',
    prompt: 'Build a landing page for my next drop.',
    requiredToolCalls: ['artist.search_or_import'],
  },
  {
    id: 'smartlink-before-friday',
    prompt: 'Create a smart link for my new song before Friday.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'ep-out-next-month',
    prompt: "I need a release page for my EP that's out next month.",
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'launch-page-and-smart-link',
    prompt: 'Start my release launch: make the page and the smart link.',
    requiredToolCalls: [
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ],
  },
  {
    id: 'smart-link-from-spotify-artist-page',
    prompt:
      'Make me a smart link for my song. My Spotify artist page is https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPo',
    requiredToolCalls: [
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ],
  },
  {
    id: 'release-page-new-album',
    prompt: 'Set up a release page for my new album.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'streaming-links-page',
    prompt:
      'Create a page for my upcoming release with all the streaming links in one place.',
    requiredToolCalls: ['artist.search_or_import'],
  },
  {
    id: 'dropping-a-track-friday',
    prompt: "I'm dropping a track Friday — build the release page.",
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'prepare-release-launch',
    prompt: 'Prepare my release launch.',
    requiredToolCalls: [
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ],
  },
  {
    id: 'one-link-for-new-single',
    prompt:
      'Make a one-link page for my new single that listeners can tap from my bio.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'artist-release-page-and-link',
    prompt: 'Set up my artist release page and smart link.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'draft-launch-page-next-single',
    prompt: 'Draft a launch page for my next single.',
    requiredToolCalls: ['artist.search_or_import'],
  },
  {
    id: 'one-link-bio',
    prompt:
      'I want one link for my new single that people can click from my profile.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'named-single-next-week',
    prompt:
      "Set up a release page for my single 'Night Swim' coming out next week.",
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'release-page-ready-for-launch',
    prompt: 'Get my release page ready for launch.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'smart-link-and-page-new-track',
    prompt: 'Make a smart link and release page for my new track.',
    requiredToolCalls: ['artist.search_or_import', 'workspace.create_draft'],
  },
  {
    id: 'band-ep-page',
    prompt: "Start a release page for my band's new EP.",
    requiredToolCalls: ['artist.search_or_import'],
  },
  {
    id: 'single-already-on-spotify',
    prompt:
      'Set up the launch page for my single that is already on Spotify. Here is the release link: https://open.spotify.com/track/25dMCbj0duxuvx5T8ClCp3',
    requiredToolCalls: [
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ],
  },
];

export const LISTENER_CASES: readonly ListenerCase[] = [
  { id: 'play-latest-song', prompt: "Play this artist's latest song." },
  { id: 'where-to-listen', prompt: 'Where can I listen to this artist?' },
  {
    id: 'similar-music',
    prompt: 'Find new music similar to what I already like.',
  },
  { id: 'study-playlist', prompt: "What's a good playlist for studying?" },
  { id: 'next-tour', prompt: "When does this artist's next tour start?" },
  { id: 'who-wrote-song', prompt: 'Who wrote the song I am humming?' },
  { id: 'chill-indie-recs', prompt: 'Recommend some chill indie tracks.' },
  {
    id: 'tickets-live',
    prompt: 'How do I get tickets to see this artist live?',
  },
  { id: 'lyrics', prompt: 'What are the lyrics to this song?' },
  { id: 'follow-artist', prompt: 'Follow this artist for me.' },
  {
    id: 'release-updates',
    prompt: 'Tell me when this artist releases new music.',
  },
  { id: 'newsletter', prompt: "Subscribe me to this artist's newsletter." },
  {
    id: 'monthly-listeners',
    prompt: 'How many monthly listeners does this artist have?',
  },
  { id: 'top-tracks', prompt: "Show me this artist's top tracks." },
  { id: 'on-tour-now', prompt: 'Is this artist on tour right now?' },
  { id: 'buy-merch', prompt: 'I want to buy this merch I saw at the show.' },
  {
    id: 'offline-download',
    prompt: 'Download this song for offline listening.',
  },
  { id: 'add-to-playlist', prompt: 'Add this track to my playlist.' },
  { id: 'what-genre', prompt: 'What genre is this artist?' },
  {
    id: 'share-profile',
    prompt: "Share this artist's profile with my friend.",
  },
];
