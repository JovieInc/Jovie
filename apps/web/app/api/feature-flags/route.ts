import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  isEnabled,
} from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const names = Object.keys(FEATURE_FLAGS) as FeatureFlag[];
  const flags = Object.fromEntries(names.map(name => [name, isEnabled(name)]));
  return NextResponse.json({ flags });
}
