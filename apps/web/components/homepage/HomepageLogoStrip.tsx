// @coverage-via apps/web/tests/unit/home/homepage-anatomy-contract.test.tsx
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import {
  TRUST_LOGO_ASSETS,
  type TrustLogoAssetId,
} from '@/components/media/trustLogoAssets';
import { PROOF_REGISTRY, type ProofItem } from '@/data/product-truth/proof';

type LogoProofItem = Extract<ProofItem, { kind: 'logo' }>;

const TRUST_LOGO_IDS = new Set<string>(TRUST_LOGO_ASSETS.map(({ id }) => id));

function isHomepageLogo(proof: ProofItem): proof is LogoProofItem {
  if (proof.kind !== 'logo') return false;
  // The homepage is ICP-agnostic: only audience-neutral or general proof.
  const audienceFits = !proof.audiences || proof.audiences.includes('general');
  return audienceFits && TRUST_LOGO_IDS.has(proof.assetId);
}

/**
 * Trust logos the homepage may show: registered logo proof with a
 * relationship and a permission record (validated at registry load) that
 * speaks to every audience. Never the unpermissioned label marks.
 */
export const HOMEPAGE_LOGO_IDS: readonly TrustLogoAssetId[] =
  PROOF_REGISTRY.filter(isHomepageLogo).map(
    proof => proof.assetId as TrustLogoAssetId
  );

/**
 * Homepage logo strip (Pen Trust logos NLLgg). The zero-proof path renders
 * nothing: no placeholder and no unpermissioned logos. It appears on its own
 * once a permissioned, audience-neutral logo lands in PROOF_REGISTRY.
 */
export function HomepageLogoStrip({
  logoIds = HOMEPAGE_LOGO_IDS,
}: Readonly<{ logoIds?: readonly TrustLogoAssetId[] }>) {
  if (logoIds.length === 0) return null;

  return (
    <div data-homepage-testid='homepage-logo-strip'>
      <HomeTrustSection
        presentation='inline-strip'
        sectionVariant='homepage-identity'
        logoIds={logoIds}
        ariaLabel='Companies that work with Jovie'
      />
    </div>
  );
}
