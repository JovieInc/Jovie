/**
 * /youtube-thumbnails copy — JOV-5862 lock.
 *
 * Paste channel first. Three free before/after per channel, server-counted.
 * Connect only to apply. No standalone SKU: thumbnails ride the existing
 * Jovie plan. No generated or altered faces, ever.
 */
export const YOUTUBE_THUMBNAILS_COPY = {
  seo: {
    title: 'YouTube Thumbnails',
    description:
      'Paste your channel. See three of your thumbnails redone, free. Connect YouTube only when you want to apply one.',
  },
  hero: {
    eyebrow: 'YouTube Thumbnails',
    title: 'Paste your channel. See three thumbnails, redone.',
    body: 'Jovie takes three of your recent videos and puts the thumbnail you have next to the one it would ship. No account and no Google sign-in until you want to apply one.',
  },
  form: {
    label: 'Your channel',
    placeholder: '@handle or youtube.com/@handle',
    submit: 'Show me 3',
    helper: 'Three free per channel. Jovie never generates or alters faces.',
  },
  states: {
    loading: 'Finding your latest videos…',
    previewOnly: 'Redos open soon. These are the three we would start with.',
    ready: 'Your three, redone.',
    remaining: (count: number) =>
      count === 1 ? '1 free redo left.' : `${count} free redos left.`,
    invalidChannel:
      'We could not find that channel. Paste the @handle or the channel link.',
    noVideos: 'That channel has no public videos yet.',
    limitReached: 'You have seen your three. Connect to keep going.',
    cooldown: 'One at a time. Give it a minute.',
    blocked: 'That network is blocked. Try again from a normal connection.',
    unavailable: 'YouTube lookups are paused right now. Try again shortly.',
    error: 'Something broke on our side. Try again in a minute.',
  },
  results: {
    beforeLabel: 'Now',
    afterLabel: 'Jovie',
    pendingLabel: 'Redo coming soon',
    applyCta: 'Connect to apply',
    applyNote:
      'Applying to YouTube needs Connect. Full-size download needs an account.',
  },
  workflow: {
    eyebrow: 'Three steps',
    title: 'Paste. Look. Apply.',
    body: 'You see the difference before you sign in to anything. Connect is the last step, not the first.',
    steps: [
      {
        title: 'Paste your channel',
        description:
          'An @handle or a channel link. Jovie pulls three recent public videos. No login.',
      },
      {
        title: 'See three before-and-afters',
        description:
          'Your current thumbnail next to the one Jovie would ship. Same people, same moment, clearer packaging.',
      },
      {
        title: 'Connect only to apply',
        description:
          'Like one? Connect YouTube and Jovie sets it. Nothing touches your channel until you say so.',
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
          'Approved design invariants can scale across the channel. New visual directions return to you first.',
      },
      {
        title: 'Automation is explicit',
        description:
          'Jovie can recommend full automation after repeated agreement. You choose whether to turn it on or stay in every decision.',
      },
      {
        title: 'YouTube stays in control',
        description:
          'Applying uses YouTube’s own thumbnail update with your permission. Nothing runs unattended until you allow it.',
      },
    ],
  },
  included: {
    eyebrow: 'Included',
    title: 'No separate plan.',
    body: 'Thumbnails come with your Jovie plan. Free shows you three per channel. Applying needs YouTube Connect.',
    cta: 'Get started',
  },
} as const;
