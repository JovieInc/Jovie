import { NextResponse } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getExtensionFlags } from '@/lib/extensions/flags';
import { createExtensionCorsHeaders } from '@/lib/extensions/http';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
  });
}

export async function GET(request: Request) {
  const { userId } = await getOptionalAuth();

  return NextResponse.json(getExtensionFlags(Boolean(userId)), {
    headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
  });
}
