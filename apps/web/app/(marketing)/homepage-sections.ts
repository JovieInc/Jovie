export type HomepageSectionFlags = {
  hero: boolean;
  labelLogos: boolean;
  howItWorks: boolean;
  dashboardShowcase: boolean;
  productPreview: boolean;
  exampleProfiles: boolean;
  deeplinksGrid: boolean;
  problem: boolean;
  comparison: boolean;
  whatYouGet: boolean;
  seeItInAction: boolean;
  finalCta: boolean;
};

export const buildHomepageSectionFlags = (
  values: readonly boolean[]
): HomepageSectionFlags => {
  const [
    hero,
    labelLogos,
    howItWorks,
    dashboardShowcase,
    productPreview,
    exampleProfiles,
    deeplinksGrid,
    problem,
    comparison,
    whatYouGet,
    seeItInAction,
    finalCta,
  ] = values;

  return {
    hero,
    labelLogos,
    howItWorks,
    dashboardShowcase,
    productPreview,
    exampleProfiles,
    deeplinksGrid,
    problem,
    comparison,
    whatYouGet,
    seeItInAction,
    finalCta,
  };
};
