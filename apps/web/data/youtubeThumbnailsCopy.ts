export const YOUTUBE_THUMBNAILS_COPY = {
  seo: {
    title: 'YouTube Thumbnail Optimization',
    description:
      'Approve thumbnail styles once, review candidates in one Inbox, and let Jovie optimize your channel through native YouTube experiments.',
  },
  hero: {
    eyebrow: 'YouTube Thumbnails',
    title: 'Stop managing thumbnails.',
    body: 'Jovie brings every thumbnail decision to one Inbox, learns the visual rules you approve, and improves your channel without changing anyone’s face.',
    primaryCta: 'Start with 10 free',
    secondaryCta: 'See the approval loop',
    subcopy:
      '10 candidates each month with a “Thumbnails Powered by Jovie” link in your video description. No generated creator or collaborator faces.',
  },
  workflow: {
    eyebrow: 'One quiet loop',
    title: 'Approve the look. Keep making videos.',
    body: 'Every new style starts with you. As your decisions become consistent, Jovie asks less and proposes a fully automatic mode only when confidence is high.',
    steps: [
      {
        title: 'Connect your channel',
        description:
          'Jovie inventories the catalog, protects current winners, and finds the videos with the largest packaging opportunity.',
      },
      {
        title: 'Swipe through one Inbox',
        description:
          'Approve or reject candidates in a focused session. Add rejection feedback once at the end, without a daily designer thread.',
      },
      {
        title: 'Measure what matters',
        description:
          'Native YouTube experiments compare approved designs. Qualified watch time and revenue signals matter more than clicks alone.',
      },
    ],
  },
  safeguards: {
    eyebrow: 'The rules stay locked',
    title: 'Grow without changing who you are.',
    items: [
      {
        title: 'Real people stay real',
        description:
          'Jovie never generates, replaces, or materially alters the creator or collaborators in a thumbnail.',
      },
      {
        title: 'Every style earns approval',
        description:
          'Approved design invariants can scale across the channel. New visual directions return to the Inbox first.',
      },
      {
        title: 'Automation is explicit',
        description:
          'Jovie can recommend full automation after repeated agreement. You choose whether to turn it on or stay in every decision.',
      },
      {
        title: 'YouTube stays in control',
        description:
          'The alpha uses YouTube Studio’s native experiment flow with supervised playback before unattended operation.',
      },
    ],
  },
  plans: {
    eyebrow: 'Founding access',
    title: 'Start free. Pay when the loop is worth scaling.',
    free: {
      name: 'Free',
      price: '$0',
      cadence: 'forever',
      description: 'For proving the workflow on your channel.',
      features: [
        '10 thumbnail candidates each month',
        'Creator approval on every new style',
        '“Thumbnails Powered by Jovie” description link',
      ],
      cta: 'Start with 10 free',
    },
    founder: {
      name: 'Founder',
      price: '$29',
      cadence: 'per month',
      description: 'For creators ready to optimize the full catalog.',
      features: [
        'Unlimited thumbnail candidate generation',
        'Up to 10 live experiment starts each month',
        'No powered-by link required',
      ],
      cta: 'Get founder access',
    },
  },
} as const;
