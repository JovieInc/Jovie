import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import {
  initiativeAckView,
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
  readonly landed_ref?: string;
  readonly task_id?: string;
  readonly linear_id?: string;
}): Promise<NextResponse> {
  const gate = authorizeSummerControl({
    authenticated: input.authenticated,
    isAdmin: input.isAdmin,
  });
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status });
  }
  if (!input.id.trim()) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const initiative = await markInitiativeLanded(input.store, {
      id: input.id,
      landed_ref: input.landed_ref,
      task_id: input.task_id,
      linear_id: input.linear_id,
    });
    if (!initiative) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      initiative: initiativeAckView(initiative),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
