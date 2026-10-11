import { ABOUT_COPY, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';

/**
 * Flagged About refresh. Every line is projected from company identity or the
 * existing About record. There is no public evidence-backed stats route in
 * the marketing app, so this refresh does not link a stats page.
 */

export function aboutRefreshOpener(definition: string): string {
  const firstSentence = definition.split(/(?<=\.)\s+/u)[0]?.trim();
  return firstSentence && firstSentence.length > 0 ? firstSentence : definition;
}

export const ABOUT_REFRESH_OPENER = aboutRefreshOpener(
  COMPANY_IDENTITY.definition
);

const DIFFERENTIATOR_TITLES = [
  'Living Profile',
  'Relationships',
  'Adaptive',
] as const;

export const ABOUT_REFRESH_DIFFERENTIATORS = DIFFERENTIATOR_TITLES.map(
  title => {
    const feature = ABOUT_COPY.features.find(item => item.title === title);
    if (!feature) {
      throw new Error(`Missing about differentiator: ${title}`);
    }
    return feature;
  }
);

const founderBio = ABOUT_FAQ_ITEMS.find(
  item => item.question === 'Who founded Jovie?'
)?.answer;

export const ABOUT_REFRESH_TEAM = [
  {
    name: 'Tim White',
    role: 'Founder',
    signoff: ABOUT_COPY.origin.signoff,
    bio: founderBio ?? '',
    imageSrc: '/images/avatars/tim-white.jpg',
    imageAlt: 'Tim White, founder of Jovie',
  },
] as const;
