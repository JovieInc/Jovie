import { NextRequest, NextResponse } from 'next/server';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';

export async function GET(
  request: NextRequest,
  _context: { params: Promise<{}> }
) {
  try {
    void _context;
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const profile = await getCreatorProfileWithLinks(username);

    if (!profile) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching creator profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
