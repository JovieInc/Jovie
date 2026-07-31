import { NextResponse } from 'next/server';
import { switchActiveProfile } from '@/app/app/(shell)/dashboard/actions/switch-profile';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';

// Use Node.js runtime for compatibility with DB libs used by the server action.
export const runtime = 'nodejs';

interface SwitchProfileBody {
  profileId?: unknown;
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody<SwitchProfileBody | null>(request, {
    route: 'POST /api/dashboard/profile/switch',
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const profileId = parsed.data?.profileId;
  if (typeof profileId !== 'string' || profileId.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Profile ID is required' },
      { status: 400 }
    );
  }

  try {
    const result = await switchActiveProfile(profileId);
    if (!result.success) {
      const status = result.error === 'Unauthorized' ? 401 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    await captureError('POST /api/dashboard/profile/switch failed', error, {
      route: '/api/dashboard/profile/switch',
      method: 'POST',
    });
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
