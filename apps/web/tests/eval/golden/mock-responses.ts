/**
 * Deterministic mock LLM responses for the golden eval CI gate.
 *
 * These represent the quality bar the product should meet. CI asserts the
 * golden-case rules against these fixed responses without calling providers.
 */

import { GOLDEN_CASES } from './cases';

export const GOLDEN_MOCK_RESPONSES: Readonly<Record<string, string>> = {
  'Pinned opportunity: answer from card facts without restating':
    'Your pinned card flags weak YouTube thumbnails on a few videos. Generate custom variants next, pick winners, then swap under approval so we can measure the CTR lift against baseline.',

  'Release timing: best day of week':
    'Friday is the standard release day for singles. New Music Friday is when streaming platforms refresh editorial playlists, so a Friday launch helps your first-week streams. Plan your distributor upload with enough lead time so the release goes live at midnight in your earliest target timezone.',

  'Release timing: lead time for pre-saves':
    'Set up pre-saves at least 2 weeks before release. That gives you time to promote the link across social channels and build momentum heading into launch week. Most distributors also need lead time for editorial pitching, so earlier is better than a last-minute scramble.',

  'Royalties: mechanical vs performance':
    'Mechanical royalties come from reproduction of the composition when a song is streamed, downloaded, or pressed. Performance royalties come from public performance of that composition and are collected by PROs like ASCAP or BMI. If you wrote the song, you need both streams covered: mechanical through your distributor and performance through your PRO registration.',

  'Royalties: per-stream rates are not fixed':
    'Spotify per-stream payout varies by country, listener plan, and monthly platform volume. The average is often cited around three to five tenths of a cent, but you should not budget off one fixed number. Track your actual statements instead of assuming every stream pays the same.',

  'Royalties: splits with collaborators':
    'Get your split in writing before release. Agree on percentages for each writer share of the composition, then register that split sheet with your distributor and PRO. Equal splits are common for co-writes, but whatever you choose should be documented now, not argued about later.',

  'Playlist pitching: editorial timeline':
    'Pitch to Spotify editorial before release day through Spotify for Artists. Submit at least one week early, ideally two to four weeks out, while editors are still planning playlist updates. After the track is live, that editorial pitch window closes.',

  'Playlist pitching: algorithmic vs editorial':
    'Editorial playlists are curated by Spotify in-house curator teams through the pre-release pitch tool. Algorithmic playlists like Discover Weekly are personalized per listener based on taste signals. Editorial can create a spike; algorithmic can sustain streams over time.',

  'Distribution: exclusivity warning':
    'Be careful with exclusive distribution deals. Exclusivity can lock your catalog to one partner and limit future flexibility. For most indie artists, non-exclusive distribution keeps options open unless the exclusive partner is offering meaningful marketing, advances, or relationships that justify the tradeoff.',

  'Marketing: ad timing relative to release':
    'Start ads one to two weeks before release to drive pre-save momentum, then keep spend active through release week. Use the pre-release window for awareness and the launch window for conversion from pre-save to stream.',

  'Marketing: budget for small artists':
    'With a tight budget, prioritize short-form social content first because it has the best organic reach per dollar. Film a few strong clips for TikTok or Reels, then put a small targeted spend behind your best-performing post.',

  'Abstention: legal advice on contracts':
    'A 360 deal is a major legal commitment that can touch touring, merch, publishing, and sponsorship income. You should have a music attorney or entertainment lawyer review the terms before you sign. I can outline questions to ask, but this needs qualified legal advice on your specific contract.',

  'Abstention: tax advice on music income':
    'Streaming royalties are taxable income, and how you report them depends on your business structure and location. Work with a tax accountant who understands music income so you capture valid deductions and file correctly.',

  'Catalog: release frequency':
    'Stay consistent with singles rather than disappearing for long stretches. Releasing singles every four to eight weeks keeps your catalog active and gives you more chances to pitch and earn algorithmic pickup.',

  'Streaming: what counts as a stream':
    'Spotify counts a stream after 30 seconds of continuous playback. If a listener skips before 30 seconds, that play does not count toward your stream total.',

  'Profile: Spotify Canvas importance':
    'Canvas can lift engagement on a track because the looping visual gives listeners another reason to save and share. It is worth adding Canvas on key singles, especially around a new release when you want stronger listener response.',

  'Entitlement gate: album art upsell on free plan':
    "For this single I'd generate three cover directions built from your genre and title — one bold typographic treatment, one photo-led concept, and one minimal graphic mark, each delivered as release-ready square album art. Album art generation is on the Pro plan, so upgrading unlocks it for this and future releases.",
};

export function getGoldenMockResponse(caseName: string): string {
  const response = GOLDEN_MOCK_RESPONSES[caseName];
  if (!response) {
    throw new Error(`Missing golden mock response for case: ${caseName}`);
  }
  return response;
}

export function assertGoldenMockCoverage(): void {
  const missing = GOLDEN_CASES.filter(
    golden => GOLDEN_MOCK_RESPONSES[golden.name] === undefined
  ).map(golden => golden.name);

  if (missing.length > 0) {
    throw new Error(`Golden mock responses missing for: ${missing.join(', ')}`);
  }
}
