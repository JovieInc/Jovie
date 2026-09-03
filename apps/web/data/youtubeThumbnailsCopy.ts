/**
 * /youtube-thumbnails copy — JOV-5862 lock.
 * Paste channel first. Three free before/after. Connect only to apply.
 * No standalone SKU.
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
    invalidChannel:
      'We could not find that channel. Paste the @handle or the channel link.',
    noVideos: 'That channel has no public videos yet.',
    error: 'Something broke on our side. Try again in a minute.',
  },
  results: {
    beforeLabel: 'Now',
    afterLabel: 'Jovie',
    applyCta: 'Connect to apply',
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

export const YOUTUBE_THUMBNAILS_EVENTS = {
  EXPOSED: 'youtube_thumbnails_paste_exposed',
  PREVIEWED: 'youtube_thumbnails_previewed',
  APPLY_CLICKED: 'youtube_thumbnails_apply_clicked',
} as const;

/** JOV-INV-012 contract on analytics, retouch, and YouTube experiments. */
export const YOUTUBE_THUMBNAILS_OPTIMIZATION = {
  variantIdentity: 'youtube-thumbnails:paste-channel:v1',
  exposure: YOUTUBE_THUMBNAILS_EVENTS.EXPOSED,
  outcome: YOUTUBE_THUMBNAILS_EVENTS.APPLY_CLICKED,
  attribution: 'source=youtube-thumbnails',
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'content-variant',
  ] as const,
  hypothesis:
    'Paste-first three free before/after raises Connect-to-apply versus a SKU-first signup.',
  primaryMetric: 'apply_connect_rate',
  liveApplyMetric: 'watch_minutes_per_impression',
  liveApplySurface: 'youtube_packaging_experiment',
  generationWorkflow: 'retouch',
  generationModel: 'google/gemini-2.5-flash-image',
  guardrails:
    'no face/body alteration; 3 free/visitor and /channel; cache video+style; datacenter/burst/spread hard-block; download+apply need account; apply needs YouTube Connect; thumbnails.set disabled',
  privacyAndConsent:
    'Visitor key is sha256(IP + device). Public thumbnails only. No OAuth until apply.',
  optimizerOwner: 'Product',
  cadence:
    'weekly after FEATURE_YOUTUBE_THUMBNAILS_PASTE_GENERATE is certified',
  decisionWriteback: 'youtube_packaging_experiment',
  rollbackOrControl:
    'YOUTUBE_THUMBNAILS_PASTE_GENERATE=false keeps preview_only; evaluateDirectThumbnailMutation stays denied.',
} as const;
