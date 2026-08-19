import { NextResponse } from 'next/server';
import {
  handleOvieMcpRequest,
  UNAUTHENTICATED_WWW_AUTHENTICATE,
} from '@/lib/ovie/mcp/handler';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';

export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'Authorization, Content-Type, MCP-Protocol-Version',
};

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const result = await handleOvieMcpRequest({
    body,
    principal: await resolveOviePrincipal(request),
    store: getOvieOperatingStore(),
  });
  if (result.body === null) {
    return new NextResponse(null, { status: result.status, headers: CORS });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { ...CORS, ...result.headers },
  });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 401,
    headers: { ...CORS, 'www-authenticate': UNAUTHENTICATED_WWW_AUTHENTICATE },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}
