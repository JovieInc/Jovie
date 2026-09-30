export const HERO_VARIANT_NAMES = [
  'split-link-claim',
  'left-content',
  'left-buttons',
  'centered-homepage',
  'npm-copy',
  'f-layout-desktop-screenshot',
  'mobile-390',
] as const;

export type HeroVariantName = (typeof HERO_VARIANT_NAMES)[number];
export type DesktopHeroVariantName = Exclude<HeroVariantName, 'mobile-390'>;

export interface HeroVariantContract {
  readonly variant: HeroVariantName;
  readonly penId: string;
  readonly useWhen: string;
}

/** Ordered only for stable snapshots; selection is driven by the typed use case. */
export const HERO_DECISION_TABLE = [
  {
    variant: 'split-link-claim',
    penId: 'xm2iz',
    useWhen: 'claim conversion',
  },
  {
    variant: 'left-content',
    penId: 'WQe2p',
    useWhen: 'informational',
  },
  {
    variant: 'left-buttons',
    penId: 'lnKPH',
    useWhen: 'two actions',
  },
  {
    variant: 'centered-homepage',
    penId: 'OxwR1',
    useWhen: 'homepage only',
  },
  {
    variant: 'npm-copy',
    penId: 'KhYER',
    useWhen: 'developer audience with a copy-command action',
  },
  {
    variant: 'f-layout-desktop-screenshot',
    penId: 'joK4X',
    useWhen: 'an aha capture exists',
  },
  {
    variant: 'mobile-390',
    penId: 'qENyP',
    useWhen: 'responsive projection only',
  },
] as const satisfies readonly HeroVariantContract[];

export const HERO_PEN_ID_BY_VARIANT = Object.fromEntries(
  HERO_DECISION_TABLE.map(contract => [contract.variant, contract.penId])
) as Readonly<Record<HeroVariantName, string>>;

export const MARKETING_HEADER_DECISION = {
  penId: 'eoUUU',
  instanceCount: 1,
  states: ['docked', 'scrolled'],
} as const;

export type HeroDecisionInput =
  | {
      readonly useCase: 'claim-conversion';
      readonly conversion: 'claim-handle' | 'claim-profile';
    }
  | { readonly useCase: 'informational' }
  | { readonly useCase: 'two-actions'; readonly actionCount: 2 }
  | { readonly useCase: 'homepage'; readonly route: '/' }
  | {
      readonly useCase: 'copy-command';
      readonly audience: 'developer';
      readonly action: 'copy-command';
    }
  | { readonly useCase: 'aha-capture'; readonly captureId: string }
  | {
      readonly useCase: 'responsive-projection';
      readonly viewportWidth: 390;
      readonly sourceVariant: DesktopHeroVariantName;
    };

function contractFor(variant: HeroVariantName): HeroVariantContract {
  const contract = HERO_DECISION_TABLE.find(item => item.variant === variant);
  if (!contract) throw new Error(`Missing locked hero contract for ${variant}`);
  return contract;
}

export function selectHeroDecision(
  input: HeroDecisionInput
): HeroVariantContract {
  switch (input.useCase) {
    case 'claim-conversion':
      return contractFor('split-link-claim');
    case 'informational':
      return contractFor('left-content');
    case 'two-actions':
      return contractFor('left-buttons');
    case 'homepage':
      return contractFor('centered-homepage');
    case 'copy-command':
      return contractFor('npm-copy');
    case 'aha-capture':
      if (!input.captureId.trim()) {
        throw new Error('The F-layout hero requires an aha capture.');
      }
      return contractFor('f-layout-desktop-screenshot');
    case 'responsive-projection':
      return contractFor('mobile-390');
  }
}
