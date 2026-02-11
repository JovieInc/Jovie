import type { ArtistContext } from '../helpers';
import { createReleaseTool } from './create-release';
import { createGenerateInsightsTool } from './generate-insights';
import { createManageCanvasTool } from './manage-canvas';
import { createProfileEditTool } from './profile-edit';
import { createQueryAnalyticsTool } from './query-analytics';

interface BuildChatToolsOptions {
  artistContext: ArtistContext;
  profileId: string | null;
  userId: string;
  aiCanUseTools: boolean;
}

export function buildChatTools({
  artistContext,
  profileId,
  userId,
  aiCanUseTools,
}: BuildChatToolsOptions) {
  if (!aiCanUseTools) {
    return {};
  }

  return {
    proposeProfileEdit: createProfileEditTool(artistContext),
    manageCanvas: createManageCanvasTool(profileId),
    ...(profileId
      ? {
          createRelease: createReleaseTool(profileId),
          queryAnalytics: createQueryAnalyticsTool(profileId),
          generateInsights: createGenerateInsightsTool(profileId, userId),
        }
      : {}),
  };
}
