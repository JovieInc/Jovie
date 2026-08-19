import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import {
  listPendingInitiatives,
  markInitiativeLanded,
  toPendingInitiativeView,
} from '@/lib/ovie/persist';

export async function respondToOviePending(input: {
  readonly authenticated: boolean;
  readonly isAdmin: boolean;
  readonly store: OperatingStore;
}): Promise<NextResponse> {
  const gate = authorizeSummerControl({
    authenticated: input.authenticated,
    isAdmin: input.isAdmin,
  });
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status });
  }
  const pending = await listPendingInitiatives(input.store);
  return NextResponse.json({
    ok: true,
    initiatives: pending.map(toPendingInitiativeView),
  });
}

export async function respondToOvieLanded(input: {
  readonly authenticated: boolean;
  readonly isAdmin: boolean;
  readonly store: OperatingStore;
  readonly id: string;
  readonly landed_ref: string;
}): Promise<NextResponse> {
  const gate = authorizeSummerControl({
    authenticated: input.authenticated,
    isAdmin: input.isAdmin,
  });
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status });
  }
  const landedRef = input.landed_ref.trim();
  if (!input.id.trim() || !landedRef) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const initiative = await markInitiativeLanded(input.store, {
    id: input.id,
    landed_ref: landedRef,
  });
  if (!initiative) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({ ok: true, initiative });
}
