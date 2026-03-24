import { linkInBioAlternative } from './link-in-bio';
import { linktreeAlternative } from './linktree';
import type { AlternativeData } from './types';

export type {
  AlternativeData,
  AlternativeFaq,
  AlternativeHighlight,
} from './types';

const alternatives: Record<string, AlternativeData> = {
  linktree: linktreeAlternative,
  'link-in-bio': linkInBioAlternative,
};

export function getAlternative(slug: string): AlternativeData | undefined {
  return alternatives[slug];
}

export function getAlternativeSlugs(): string[] {
  return Object.keys(alternatives);
}
