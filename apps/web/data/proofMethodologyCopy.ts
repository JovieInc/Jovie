/** Copy for the /proof/methodology page (rules and methods, never values). */
export const PROOF_METHODOLOGY_COPY = {
  rules: {
    heading: 'Rules For Every Number',
    items: [
      'Team, test and automated accounts never count.',
      'Counts round down and times round up, so a published number never overstates the measurement.',
      'A number appears only while it is current and past its threshold. Otherwise it is removed.',
      'Comparisons with other platforms use public pages only and appear after human review.',
    ],
  },
  benchmark: {
    heading: 'Benchmark Conditions',
    body: "Every week a hosted runner loads one public profile per platform five times: Lighthouse with its default mobile profile and simulated throttling, plus a rendered browser load. We report the median, respect each site's robots.txt, identify our crawler by name and load nothing beyond a normal page view. If Jovie is slower on a metric, the benchmark records it and we work on it rather than drop it.",
  },
  meanings: {
    heading: 'What Each Number Means',
  },
} as const;
