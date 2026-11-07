/** Founder-approved account-wide limits, shared by streaming and batch. */
export const DICTATION_LIMITS = {
  dailyAudioSecondsPerAccount: 3600,
  maxSessionSeconds: 600,
  tokenMintsPerHour: 30,
} as const;
