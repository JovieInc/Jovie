import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  authorizeSummerControl,
  type SummerControlAuth,
} from '@/lib/ovie/control';
import {
  disablePromotedDumpAck,
  enablePromotedDumpAck,
  executePromotedDumpAck,
  getPromotedDumpAckSnapshot,
  type PromotedDumpAckInput,
} from '@/lib/ovie/promoted-workflows';
import {
  disableSummerTransport,
  enableSummerTransport,
  isSummerTransportEnabled,
} from '@/lib/ovie/summer-transport';

type SummerControlBody = {
  readonly action?:
    | 'status'
    | 'disable'
    | 'enable'
    | 'execute'
    | 'disable-transport'
    | 'enable-transport';
  readonly workId?: string;
  readonly items?: readonly string[];
  readonly sequence?: number;
};

/**
 * Same founder/admin boundary as OV chat. Summer drives Jovie through this
 * surface — not a second unofficial API (JOV-5217).
 */
export function respondToSummerControl(
  auth: SummerControlAuth,
  body?: SummerControlBody | null
): NextResponse {
  const decision = authorizeSummerControl(auth);
  if (!decision.ok) {
    return NextResponse.json({ ok: false }, { status: decision.status });
  }

  const action = body?.action ?? 'status';
  if (action === 'disable') {
    disablePromotedDumpAck();
  } else if (action === 'enable') {
    enablePromotedDumpAck();
  } else if (action === 'disable-transport') {
    disableSummerTransport();
  } else if (action === 'enable-transport') {
    enableSummerTransport();
  } else if (action === 'execute') {
    if (typeof body?.workId !== 'string' || !Array.isArray(body.items)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const input: PromotedDumpAckInput = {
      workId: body.workId,
      items: body.items,
      sequence: body.sequence,
    };
    try {
      const receipt = executePromotedDumpAck(input);
      return NextResponse.json({
        ok: true,
        surface: 'summer-jovie-control',
        customerFacingRequiresEvalGreen: true,
        lybHealthNeverEntersJovieOrOvieMemory: true,
        promotedWorkflow: getPromotedDumpAckSnapshot(),
        summerTransportEnabled: isSummerTransportEnabled(),
        receipt,
      });
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  } else if (action !== 'status') {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    surface: 'summer-jovie-control',
    customerFacingRequiresEvalGreen: true,
    lybHealthNeverEntersJovieOrOvieMemory: true,
    promotedWorkflow: getPromotedDumpAckSnapshot(),
    summerTransportEnabled: isSummerTransportEnabled(),
  });
}

async function readOptionalBody(
  request: Request
): Promise<SummerControlBody | null> {
  const text = await request.text();
  if (text.trim() === '') {
    return null;
  }
  return JSON.parse(text) as SummerControlBody;
}

export async function POST(request: Request): Promise<NextResponse> {
  const entitlements = await getCurrentUserEntitlements();
  let body: SummerControlBody | null = null;
  try {
    body = await readOptionalBody(request);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return respondToSummerControl(
    {
      authenticated: entitlements.isAuthenticated,
      isAdmin: entitlements.isAdmin,
    },
    body
  );
}
