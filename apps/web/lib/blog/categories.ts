import { slugifyCategory } from './getBlogPosts';

export interface BlogCategory {
  name: string;
  slug: string;
  description: string;
}

/** Known blog categories with descriptions for SEO */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Artist Management':
    'Insights on navigating the business side of music — managers, agents, and the systems that connect artists to opportunities.',
  'Release Strategy':
    'Playbooks for building and sustaining momentum around music releases.',
  'Inbound Marketing':
    'How artists can attract fans, industry, and opportunities without chasing them.',
};

/** Get category metadata by name */
export function getCategoryByName(name: string): BlogCategory {
  return {
    name,
    slug: slugifyCategory(name),
    description:
      CATEGORY_DESCRIPTIONS[name] ??
      `Articles about ${name.toLowerCase()} from the Jovie team.`,
  };
}

/** Get category metadata by slug */
export function getCategoryBySlug(
  slug: string,
  allCategoryNames: string[]
): BlogCategory | null {
  const name = allCategoryNames.find(n => slugifyCategory(n) === slug);
  if (!name) return null;
  return getCategoryByName(name);
}
