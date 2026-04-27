import type { LyricLine } from '@/components/shell/LyricsView.types';

/**
 * Placeholder lyric data for the migration's lyrics route.
 *
 * Production lyric storage (per-track, user-edited) is not yet wired —
 * the lyrics route ships as a UI shell rendering this static set so the
 * surface exists. Replace with a real `getLyricsByTrackId(trackId)`
 * query when the data path lands.
 */
export const MOCK_LYRICS: readonly LyricLine[] = [
  { startSec: 6, text: 'I was sleeping in the back of the car' },
  { startSec: 18, text: 'Watching the highway turn into stars' },
  { startSec: 30, text: 'You were humming a tune I forgot' },
  { startSec: 42, text: 'Half a song from a place we both lost' },
  { startSec: 54, text: 'Oh, lost in the light, lost in the light' },
  { startSec: 66, text: 'Carry me home through the long Carolina night' },
  { startSec: 80, text: 'Headlights bleed through the window glass' },
  { startSec: 94, text: 'And the radio plays like nothing has passed' },
  { startSec: 108, text: 'I keep your name like a coin in my coat' },
  { startSec: 122, text: 'Spend it slow when the cold gets close' },
  { startSec: 136, text: 'Oh, lost in the light, lost in the light' },
  { startSec: 150, text: "I'll find you again on the other side" },
  { startSec: 164, text: 'Tell me the part where the morning comes' },
  { startSec: 176, text: 'Tell me you waited, tell me you come' },
  { startSec: 190, text: 'Lost in the light, lost in the light' },
  { startSec: 202, text: 'Carry me home, carry me home tonight' },
];
