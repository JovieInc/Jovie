import { NextResponse } from 'next/server';

/**
 * Minimal debug endpoint to test if API routes are working
 * No auth, no validation, just returns a simple JSON response
 */
export async function POST() {
  console.log('[Waitlist Debug] POST request received');
  return NextResponse.json({
    success: true,
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
  });
}

export async function GET() {
  console.log('[Waitlist Debug] GET request received');
  return NextResponse.json({
    success: true,
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
  });
}
