import { describe, expect, it } from 'vitest';
import {
  authorizeSummerControl,
  SUMMER_CONTROL_PROMOTION,
} from '@/lib/ovie/control';

describe('Summer-drives-Jovie control (JOV-5217)', () => {
  it('fails closed when unauthenticated', () => {
    expect(
      authorizeSummerControl({ authenticated: false, isAdmin: false })
    ).toEqual({ ok: false, status: 401 });
    expect(
      authorizeSummerControl({ authenticated: false, isAdmin: true })
    ).toEqual({ ok: false, status: 401 });
  });

  it('rejects authenticated non-founders', () => {
    expect(
      authorizeSummerControl({ authenticated: true, isAdmin: false })
    ).toEqual({ ok: false, status: 403 });
  });

  it('accepts authenticated founder-scoped calls', () => {
    expect(
      authorizeSummerControl({ authenticated: true, isAdmin: true })
    ).toEqual({ ok: true, status: 200 });
  });

  it('keeps customer promotion and LYB memory rules locked', () => {
    expect(SUMMER_CONTROL_PROMOTION.customerFacingRequiresEvalGreen).toBe(true);
    expect(SUMMER_CONTROL_PROMOTION.lybHealthNeverEntersJovieOrOvieMemory).toBe(
      true
    );
  });
});
