import * as Sentry from '@sentry/nextjs';
import { resolveChatAccountContext } from '@/lib/chat/account-context';
import { resolveAlbumArtCapability } from '@/lib/chat/album-art-capability';
import { resolveRetouchCapability } from '@/lib/chat/retouch-capability';
import { loadCustomerChatPinnedOpportunity } from '@/lib/connectors/customer-pinned-opportunity';
import { getAppFlagValue } from '@/lib/flags/server';
import { isAlbumArtGatewayConfigured } from '@/lib/services/album-art/provider-xai';
import { isRetouchConfigured } from '@/lib/services/retouching/provider-gemini';

/**
 * Artist-only work that must run before an artist chat turn but is never
 * needed by an OV (founder Ovie) turn: account/billing context, pinned
 * opportunity, feature flags and tool capability preflights. The OV branch
 * skips this entirely so it stays off the first-token path. The reads are
 * independent, so they run in parallel.
 */
export async function resolveArtistChatPreflight(input: {
  readonly userId: string;
  readonly pinnedOpportunityCandidate: unknown;
}) {
  const [
    accountContext,
    pinnedOpportunity,
    albumArtFeatureEnabled,
    teleprompterRecordingEnabled,
  ] = await Promise.all([
    resolveChatAccountContext({ userId: input.userId }),
    loadCustomerChatPinnedOpportunity(
      input.userId,
      input.pinnedOpportunityCandidate
    ),
    getAppFlagValue('ALBUM_ART_GENERATION', { userId: input.userId }),
    getAppFlagValue('TELEPROMPTER_RECORDING', { userId: input.userId }),
  ]);
  const currentUserEntitlements = accountContext.userEntitlements;
  try {
    Sentry.setTag('plan_tier', accountContext.plan);
    Sentry.setTag('billing_verification', accountContext.billingVerification);
  } catch {
    // Observability must never break the chat request path.
  }
  return {
    accountContext,
    pinnedOpportunity,
    albumArtFeatureEnabled,
    teleprompterRecordingEnabled,
    albumArtCapability: resolveAlbumArtCapability({
      featureEnabled: albumArtFeatureEnabled,
      providerConfigured: isAlbumArtGatewayConfigured(),
      entitlements: currentUserEntitlements,
    }),
    retouchCapability: resolveRetouchCapability({
      entitlements: currentUserEntitlements,
      provisioned: isRetouchConfigured(),
    }),
  };
}
