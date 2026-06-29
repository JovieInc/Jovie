import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import {
  CODE_FLAGS,
  type CodeFlagName,
  isCodeFlagEnabled,
} from '@/lib/flags/code-flags';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const names = Object.keys(CODE_FLAGS) as CodeFlagName[];
  const flags = Object.fromEntries(
    names.map(name => [name, isCodeFlagEnabled(name)])
  );
  return NextResponse.json({ flags });
}
