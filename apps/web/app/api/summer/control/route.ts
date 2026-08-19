import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  authorizeSummerControl,
  type SummerControlAuth,
} from '@/lib/ovie/control';

/**
 * Same founder/admin boundary as OV chat. Summer drives Jovie through this
 * surface — not a second unofficial API (JOV-5217).
 */
export function respondToSummerControl(auth: SummerControlAuth): NextResponse {
  const decision = authorizeSummerControl(auth);
  if (!decision.ok) {
    return NextResponse.json({ ok: false }, { status: decision.status });
  }
  return NextResponse.json({
    ok: true,
    surface: 'summer-jovie-control',
    customerFacingRequiresEvalGreen: true,
    lybHealthNeverEntersJovieOrOvieMemory: true,
  });
}

export async function POST(): Promise<NextResponse> {
  const entitlements = await getCurrentUserEntitlements();
  return respondToSummerControl({
    authenticated: entitlements.isAuthenticated,
    isAdmin: entitlements.isAdmin,
  });
}
