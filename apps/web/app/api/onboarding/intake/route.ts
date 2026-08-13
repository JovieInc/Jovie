import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Retired (JOV-5001). Waitlist intake is the /start chat claim path.
 * Direct POSTs fail closed so the seven-field questionnaire cannot return.
 */
export async function POST(_req: Request) {
  return NextResponse.json(
    {
      error: 'Waitlist intake has been retired. Continue in /start chat.',
      errorCode: 'INTAKE_RETIRED',
    },
    { status: 410 }
  );
}
