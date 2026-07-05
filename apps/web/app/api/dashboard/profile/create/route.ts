import { NextResponse } from 'next/server';
import { createAdditionalProfile } from '@/app/app/(shell)/dashboard/actions/switch-profile';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';

// Use Node.js runtime for compatibility with DB libs used by the server action.
export const runtime = 'nodejs';

interface CreateProfileBody {
  displayName?: unknown;
  username?: unknown;
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody<CreateProfileBody | null>(request, {
    route: 'POST /api/dashboard/profile/create',
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const displayName = parsed.data?.displayName;
  const username = parsed.data?.username;
  if (typeof displayName !== 'string' || typeof username !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Display name and username are required' },
      { status: 400 }
    );
  }

  try {
    const result = await createAdditionalProfile({ displayName, username });
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    await captureError('POST /api/dashboard/profile/create failed', error, {
      route: '/api/dashboard/profile/create',
      method: 'POST',
    });
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
