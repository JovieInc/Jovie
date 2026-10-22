import { z } from 'zod';
import {
  getCapabilityRecord,
  isFeatureUsable,
} from '@/data/marketing/featureAvailability';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';

export const onboardingRoleSchema = z.enum([
  'artist',
  'author',
  'creator',
  'expert',
  'founder',
]);
export type OnboardingRole = z.infer<typeof onboardingRoleSchema>;

/** Job adapters describe draft content, never entitlements or new products. */
export const ONBOARDING_ROLE_ADAPTERS = {
  artist: {
    matches: /\b(artist|musician|singer|band|dj|producer)\b/i,
    source: 'music page',
    question: 'Should this profile lead with a release, a show, or fan signup?',
    sections: ['music', 'releases', 'shows', 'fan signup'],
    sourceRole: (url: URL) =>
      url.hostname === 'open.spotify.com' && /^\/artist\//.test(url.pathname),
  },
  author: {
    matches: /\b(author|novelist|writer)\b/i,
    source: 'book or publication page',
    question: 'Should readers find a book, an event, or your signup first?',
    sections: ['books', 'publications', 'events', 'reader signup'],
    sourceRole: (url: URL) =>
      /(^|\.)goodreads\.com$/.test(url.hostname) &&
      /^\/author\//.test(url.pathname),
  },
  creator: {
    matches: /\b(creator|youtuber|streamer|actor|podcaster)\b/i,
    source: 'channel or featured work',
    question:
      'Should people find featured content, a subscription, or a collaboration contact first?',
    sections: [
      'channels',
      'featured content',
      'subscriptions',
      'collaborations',
    ],
    sourceRole: (url: URL) =>
      /(^|\.)youtube\.com$/.test(url.hostname) &&
      /^\/(?:@|channel\/)/.test(url.pathname),
  },
  expert: {
    matches: /\b(expert|consultant|coach|advisor|speaker)\b/i,
    source: 'services, credentials, or case study page',
    question:
      'Should a potential client review a case study, make an inquiry, or book with you first?',
    sections: ['credentials', 'services', 'case studies', 'inquiry or booking'],
    sourceRole: (_url: URL) => false,
  },
  founder: {
    matches: /\b(founder|cofounder|co-founder|entrepreneur)\b/i,
    source: 'company or product site',
    question:
      'Should a potential customer see the product launch, customer proof, or a contact link first?',
    sections: [
      'company',
      'product launches',
      'customer proof',
      'buyer contact',
    ],
    sourceRole: (_url: URL) => false,
  },
} satisfies Record<
  OnboardingRole,
  {
    matches: RegExp;
    source: string;
    question: string;
    sections: readonly string[];
    sourceRole: (url: URL) => boolean;
  }
>;

function safeDraftUrl(raw: string): boolean {
  if (!validateSocialLinkUrl(raw).valid) return false;
  const url = new URL(raw);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.hostname.endsWith('.')
  );
}
const draftUrlSchema = z.string().url().max(2048).refine(safeDraftUrl);
const sourceSchema = z.object({
  url: draftUrlSchema,
  status: z.enum(['pending', 'available', 'unavailable']),
  title: z.string().max(120).nullable(),
  description: z.string().max(600).nullable(),
  fetchedAt: z.string().datetime().nullable(),
});

export const onboardingProfileDraftSchema = z.object({
  version: z.literal(1),
  roles: z.array(onboardingRoleSchema).max(5),
  activeRole: onboardingRoleSchema.nullable(),
  outcome: z.string().max(1000).nullable(),
  outcomes: z.partialRecord(onboardingRoleSchema, z.string().max(1000)),
  sourceCandidates: z.array(draftUrlSchema).max(8),
  selectedSource: sourceSchema.nullable(),
  sourceSkipped: z.boolean(),
  awaiting: z.enum(['role', 'priority', 'source', 'outcome', 'review']),
  lastUserMessageId: z.string().max(200).nullable(),
});
export type OnboardingProfileDraft = z.infer<
  typeof onboardingProfileDraftSchema
>;

export function emptyOnboardingProfileDraft(): OnboardingProfileDraft {
  return {
    version: 1,
    roles: [],
    activeRole: null,
    outcome: null,
    outcomes: {},
    sourceCandidates: [],
    selectedSource: null,
    sourceSkipped: false,
    awaiting: 'role',
    lastUserMessageId: null,
  };
}

/** Decode only persisted server artifacts at the server boundary. */
export function readOnboardingProfileDraft(
  output: unknown
): OnboardingProfileDraft | null {
  if (!output || typeof output !== 'object' || !('profileDraft' in output))
    return null;
  const result = onboardingProfileDraftSchema.safeParse(output.profileDraft);
  return result.success ? result.data : null;
}

export function profileDraftUrls(text: string): string[] {
  return Array.from(
    new Set(
      [...text.matchAll(/https:\/\/[^\s<>"']+/gi)].flatMap(match => {
        const raw = match[0].replace(/[),.;!?]+$/, '');
        if (!safeDraftUrl(raw)) return [];
        const url = new URL(raw);
        if (url.username || url.password) return [];
        return [url.toString()];
      })
    )
  ).slice(0, 8);
}

/** Advance from actual visitor text; model-generated role labels are not inputs. */
export function advanceOnboardingProfileDraft(
  previous: OnboardingProfileDraft,
  message: { readonly id: string; readonly text: string }
): OnboardingProfileDraft {
  if (previous.lastUserMessageId === message.id) return previous;
  const draft = structuredClone(previous);
  draft.lastUserMessageId = message.id;
  const text = message.text.trim();
  const urls = profileDraftUrls(text);
  // URLs and negated roles are not self-descriptions.
  const roleText = text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bnot\s+(?:(?:really\s+)?an?\s+)?\w+/gi, '');
  const mentioned = onboardingRoleSchema.options.filter(role =>
    ONBOARDING_ROLE_ADAPTERS[role].matches.test(roleText)
  );
  const detected = mentioned.length
    ? mentioned
    : urls.flatMap(raw =>
        onboardingRoleSchema.options.filter(role =>
          ONBOARDING_ROLE_ADAPTERS[role].sourceRole(new URL(raw))
        )
      );
  draft.roles = [...new Set([...draft.roles, ...detected])].sort();
  if (draft.roles.length === 1) draft.activeRole = draft.roles[0] ?? null;
  else if (
    detected.length === 1 &&
    (previous.awaiting === 'priority' ||
      /\b(first|focus|prioriti[sz]e|priority)\b/i.test(roleText))
  )
    draft.activeRole = detected[0] ?? null;
  else if (detected.some(role => !previous.roles.includes(role)))
    draft.activeRole = null;
  draft.outcome = draft.activeRole
    ? (draft.outcomes[draft.activeRole] ?? null)
    : null;

  if (urls.length) {
    draft.sourceSkipped = false;
    draft.sourceCandidates = [
      ...new Set([...draft.sourceCandidates, ...urls]),
    ].slice(-8);
    // Multiple sources require an explicit selection; never merge identities.
    if (urls.length > 1) draft.selectedSource = null;
    else if (urls[0] !== draft.selectedSource?.url)
      draft.selectedSource = {
        url: urls[0]!,
        status: 'pending',
        title: null,
        description: null,
        fetchedAt: null,
      };
  } else if (
    /^(skip|no (?:site|source|website|link)(?: yet)?)[.!]?$/i.test(text)
  ) {
    draft.sourceSkipped = true;
  }
  const outcome = /\b(?:i want(?: to)?|my goal is|i need(?: to)?)\s+(.+)/i.exec(
    text
  )?.[1];
  if (outcome && draft.activeRole) draft.outcome = outcome.slice(0, 1000);
  else if (
    previous.awaiting === 'outcome' &&
    text.length > 5 &&
    !/^(ok(?:ay)?|yes|no|skip|continue|next)[.!]?$/i.test(text) &&
    !urls.length &&
    !mentioned.length
  )
    draft.outcome = text.slice(0, 1000);
  if (draft.activeRole && draft.outcome)
    draft.outcomes[draft.activeRole] = draft.outcome;

  draft.awaiting = !draft.roles.length
    ? 'role'
    : !draft.activeRole
      ? 'priority'
      : !draft.selectedSource && !draft.sourceSkipped
        ? 'source'
        : !draft.outcome
          ? 'outcome'
          : 'review';
  return draft;
}

/** Only these currently usable modules can be offered; sections are draft intent. */
export function availableOnboardingModules(
  draft: OnboardingProfileDraft
): string[] {
  if (!draft.activeRole || draft.awaiting === 'source') return [];
  const candidates =
    draft.activeRole === 'artist'
      ? ['public-profile', 'smart-links', 'fan-notifications']
      : ['public-profile'];
  return candidates.filter(id => {
    const capability = getCapabilityRecord(id);
    return (
      isFeatureUsable(capability) &&
      (draft.activeRole === 'artist' || capability?.audience === 'general')
    );
  });
}

export function onboardingDraftQuestion(draft: OnboardingProfileDraft): string {
  if (draft.awaiting === 'role')
    return 'What are you working on: music, a company, writing, content, or client services?';
  if (draft.awaiting === 'priority')
    return `Which job should this profile lead with: ${draft.roles.join(', ')}?`;
  if (draft.awaiting === 'source')
    return draft.sourceCandidates.length > 1
      ? 'Which one of those links represents the work you want this profile to lead with?'
      : `What is your ${ONBOARDING_ROLE_ADAPTERS[draft.activeRole!].source} URL, or would you like to skip it?`;
  return ONBOARDING_ROLE_ADAPTERS[draft.activeRole!].question;
}
