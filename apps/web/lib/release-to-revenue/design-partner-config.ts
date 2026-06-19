import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type {
  DesignPartnerConfigTemplate,
  ResolvedDesignPartnerConfig,
} from './types';

export const DEFAULT_DESIGN_PARTNER_CONFIG: DesignPartnerConfigTemplate = {
  creatorUsername: TIM_WHITE_PROFILE.handle,
  store: {
    provider: 'printful',
    scope: 'default',
  },
  socialAccount: {
    platform: 'instagram',
    handle: TIM_WHITE_PROFILE.handle,
  },
  smsListId: 'design-partner-sms-fans',
};

function resolveConfiguredUsername(): string {
  const override = env.RELEASE_TO_REVENUE_DESIGN_PARTNER_USERNAME?.trim();
  return override && override.length > 0
    ? override
    : DEFAULT_DESIGN_PARTNER_CONFIG.creatorUsername;
}

export async function resolveDesignPartnerConfig(): Promise<ResolvedDesignPartnerConfig | null> {
  const creatorUsername = resolveConfiguredUsername();

  const [row] = await db
    .select({
      creatorProfileId: creatorProfiles.id,
      userId: users.id,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.username, creatorUsername))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...DEFAULT_DESIGN_PARTNER_CONFIG,
    creatorUsername,
    creatorProfileId: row.creatorProfileId,
    userId: row.userId,
  };
}

export function isDesignPartnerUser(
  userId: string,
  config: ResolvedDesignPartnerConfig
): boolean {
  return config.userId === userId;
}
