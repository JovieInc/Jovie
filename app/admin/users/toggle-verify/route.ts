import { NextRequest, NextResponse } from 'next/server';
import { toggleCreatorVerifiedAction } from '@/app/admin/actions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    await toggleCreatorVerifiedAction(formData);

    const redirectUrl = new URL('/admin/users', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Admin toggle verify error:', error);
    const redirectUrl = new URL('/admin/users', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
