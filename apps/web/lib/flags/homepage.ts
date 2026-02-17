import { flag } from 'flags/next';

export const homepageHero = flag({
  key: 'homepage_hero',
  description: 'Show the hero section on the homepage',
  defaultValue: true,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageLabelLogos = flag({
  key: 'homepage_label_logos',
  description: 'Show the label logos bar on the homepage',
  defaultValue: true,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageHowItWorks = flag({
  key: 'homepage_how_it_works',
  description: 'Show the How It Works section on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageProductPreview = flag({
  key: 'homepage_product_preview',
  description: 'Show the product preview (ProfileMockup) on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageExampleProfiles = flag({
  key: 'homepage_example_profiles',
  description: 'Show the example profiles carousel on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageDeeplinksGrid = flag({
  key: 'homepage_deeplinks_grid',
  description: 'Show the deeplinks grid on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageProblem = flag({
  key: 'homepage_problem',
  description: 'Show the problem section on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageComparison = flag({
  key: 'homepage_comparison',
  description: 'Show the comparison section on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageWhatYouGet = flag({
  key: 'homepage_what_you_get',
  description: 'Show the What You Get section on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageSeeItInAction = flag({
  key: 'homepage_see_it_in_action',
  description: 'Show the See It In Action carousel on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

export const homepageFinalCta = flag({
  key: 'homepage_final_cta',
  description: 'Show the final CTA section on the homepage',
  defaultValue: false,
  decide() {
    return this.defaultValue as boolean;
  },
});

/** All homepage flags for bulk operations (discovery endpoint, layout encryption) */
export const homepageFlags = [
  homepageHero,
  homepageLabelLogos,
  homepageHowItWorks,
  homepageProductPreview,
  homepageExampleProfiles,
  homepageDeeplinksGrid,
  homepageProblem,
  homepageComparison,
  homepageWhatYouGet,
  homepageSeeItInAction,
  homepageFinalCta,
] as const;
