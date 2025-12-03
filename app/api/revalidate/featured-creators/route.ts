import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST() {
  revalidateTag('featured-creators', 'default');
  return NextResponse.json({ revalidated: true });
}
