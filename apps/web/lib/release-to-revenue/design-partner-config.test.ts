import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/env', () => ({ env: {} }));

import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { DEFAULT_DESIGN_PARTNER_CONFIG } from './design-partner-config';

describe('DEFAULT_DESIGN_PARTNER_CONFIG', () => {
  it('looks up the profile by its public handle, not the person handle', () => {
    // creator_profiles.username is 'tim' (jov.ie/tim); no profile is named
    // 'timwhite', so that lookup left autopilot unconfigured.
    expect(DEFAULT_DESIGN_PARTNER_CONFIG.creatorUsername).toBe(
      TIM_WHITE_PROFILE.publicProfileHandle
    );
    expect(DEFAULT_DESIGN_PARTNER_CONFIG.creatorUsername).toBe('tim');
  });
});
