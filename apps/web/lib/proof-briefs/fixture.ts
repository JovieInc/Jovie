import type { CertifiedProofBrief } from './contract';

/**
 * Canonical certified fixture (JOV-7217). Deterministic: fixed window,
 * fixed expiry far enough out that tests never flake. Every renderer test
 * consumes this object — the "image says 263" brief.
 */
export const CERTIFIED_PROOF_BRIEF: CertifiedProofBrief = {
  schema: 'proof-brief/v1',
  briefId: 'pb_2026_w38_timwhite',
  revision: 2,
  subject: 'Tim White',
  window: {
    start: '2026-09-14',
    end: '2026-09-20',
    label: 'Sep 14 – Sep 20, 2026',
  },
  hero: {
    sentence: '263 new listeners clicked through to your music this week.',
    value: '263',
    label: 'new listeners clicked through',
  },
  supportingPoints: [
    { value: '4,812', label: 'profile visits' },
    { value: '91', label: 'new followers' },
    { value: '12', label: 'playlist adds' },
  ],
  privacy: 'public',
  generatedAt: '2026-09-21T00:00:00.000Z',
  expiresAt: '2026-10-05T00:00:00.000Z',
};
